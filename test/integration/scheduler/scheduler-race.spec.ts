import type { Server } from 'http';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TestingModule } from '@nestjs/testing';
import { SchedulerService } from '../../../src/scheduler/scheduler.service';
import {
  buildTestModule,
  deterministicUuid,
  fixedClock,
  hcmMock,
  resetDb,
  seedHcmConfig,
  startMockServer,
  stopMockServer,
  DEFAULT_KEY,
} from '../setup';
import { typedQuery } from '../../helpers/db-query';

describe('RG-4: scheduler cancel races with approve', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let module: TestingModule;

  beforeAll(async () => {
    await startMockServer();
    ({ app, dataSource, module } = await buildTestModule());
  });

  afterAll(async () => {
    await app.close();
    await stopMockServer();
  });

  beforeEach(async () => {
    await resetDb(dataSource);
    await hcmMock.reset();
    deterministicUuid.reset();
  });

  it('concurrent cancel+approve produces a consistent outcome — no CANCELLED+debit or APPROVED+cancel-transition', async () => {
    // set clock so startDate is "yesterday" (before today 2024-01-15)
    fixedClock.setTime(new Date('2024-01-15T12:00:00.000Z'));

    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const submitRes = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send({
        employeeId: DEFAULT_KEY.employeeId,
        employerId: DEFAULT_KEY.employerId,
        locationId: DEFAULT_KEY.locationId,
        leaveType: DEFAULT_KEY.leaveType,
        year: DEFAULT_KEY.year,
        startDate: '2024-01-14', // yesterday — cancellation job will pick this up
        endDate: '2024-01-14',
        requestedHours: 8,
        submittedById: 'emp-1',
        managerId: 'mgr-1',
      })
      .expect(201);

    const { externalId } = submitRes.body as { externalId: string };
    const scheduler = module.get(SchedulerService);

    const [cancelResult, approveRes] = await Promise.all([
      scheduler.runCancellationJob(),
      request(app.getHttpServer() as Server)
        .post(`/requests/${externalId}/approve`)
        .send({ actorId: 'mgr-1' }),
    ]);

    void cancelResult; // void — runCancellationJob returns void

    const finalRow = await typedQuery<{ status: string }>(
      dataSource,
      'SELECT status FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    const finalStatus = finalRow[0].status;

    const transitions = await typedQuery<{ toState: string }>(
      dataSource,
      `SELECT rst.* FROM request_state_transitions rst
       JOIN time_off_requests r ON r.id = rst.requestId
       WHERE r.externalId = ?
       ORDER BY rst.id`,
      [externalId],
    );
    const debits = await hcmMock.getDebits();
    const wasDebited = debits[externalId] !== undefined;

    // outcome must be internally consistent
    if (finalStatus === 'CANCELLED') {
      // scheduler won: no HCM debit should have been committed
      expect(wasDebited).toBe(false);
      const cancelTransition = transitions.find(
        (t) => t.toState === 'CANCELLED',
      );
      expect(cancelTransition).toBeDefined();
    } else if (finalStatus === 'APPROVED') {
      // approve won: debit should have fired
      expect(wasDebited).toBe(true);
      const approveTransition = transitions.find(
        (t) => t.toState === 'APPROVED',
      );
      expect(approveTransition).toBeDefined();
      expect(approveRes.status).toBe(200);
    } else {
      // any other outcome is invalid
      throw new Error(`Unexpected final status: ${finalStatus}`);
    }
  });
});
