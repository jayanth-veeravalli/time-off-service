import type { Server } from 'http';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TestingModule } from '@nestjs/testing';
import { SchedulerService } from '../../src/scheduler/scheduler.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
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
  BalanceKey,
} from './setup';
import { typedQuery } from '../helpers/db-query';

describe('RG-8: cancellation job cancels only past-startDate PENDING requests', () => {
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
    // frozen clock: today = 2024-01-15
    fixedClock.setTime(new Date('2024-01-15T12:00:00.000Z'));
  });

  it('only the past-startDate request is CANCELLED; today and future remain PENDING', async () => {
    await seedHcmConfig(dataSource);

    const seedAndSubmit = async (
      employeeId: string,
      startDate: string,
      endDate: string,
    ) => {
      const key: BalanceKey = { ...DEFAULT_KEY, employeeId };
      await hcmMock.seed(key, 80);
      const res = await request(app.getHttpServer() as Server)
        .post('/requests')
        .send({
          employeeId,
          employerId: DEFAULT_KEY.employerId,
          locationId: DEFAULT_KEY.locationId,
          leaveType: DEFAULT_KEY.leaveType,
          year: DEFAULT_KEY.year,
          startDate,
          endDate,
          requestedHours: 8,
          submittedById: employeeId,
          managerId: 'mgr-1',
        })
        .expect(201);
      return (res.body as { externalId: string }).externalId;
    };

    const pastId = await seedAndSubmit('emp-1', '2024-01-14', '2024-01-14'); // yesterday
    const todayId = await seedAndSubmit('emp-2', '2024-01-15', '2024-01-15'); // today
    const futureId = await seedAndSubmit('emp-3', '2024-01-16', '2024-01-16'); // tomorrow

    const notifications = module.get(NotificationsService);
    const notifySpy = jest.spyOn(notifications, 'notifyEmployee');

    const scheduler = module.get(SchedulerService);
    await scheduler.runCancellationJob();

    const statuses = await typedQuery<{ externalId: string; status: string }>(
      dataSource,
      `SELECT externalId, status FROM time_off_requests ORDER BY startDate`,
    );
    const statusMap: Record<string, string> = {};
    for (const row of statuses) {
      statusMap[row.externalId] = row.status;
    }

    expect(statusMap[pastId]).toBe('CANCELLED');
    expect(statusMap[todayId]).toBe('PENDING');
    expect(statusMap[futureId]).toBe('PENDING');

    // transition for cancelled request has actorType = SYSTEM
    const transitions = await typedQuery<{ actorType: string }>(
      dataSource,
      `SELECT rst.* FROM request_state_transitions rst
       JOIN time_off_requests r ON r.id = rst.requestId
       WHERE r.externalId = ? AND rst.toState = 'CANCELLED'`,
      [pastId],
    );
    expect(transitions).toHaveLength(1);
    expect(transitions[0].actorType).toBe('SYSTEM');

    // notifyEmployee called exactly once (for the one cancelled request)
    const cancelNotifications = notifySpy.mock.calls.filter(
      (call) => call[1] === 'CANCELLED',
    );
    expect(cancelNotifications).toHaveLength(1);
    expect(cancelNotifications[0][0]).toBe('emp-1');

    notifySpy.mockRestore();
  });
});
