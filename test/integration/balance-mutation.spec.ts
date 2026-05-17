import type { Server } from 'http';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  buildTestModule,
  deterministicUuid,
  hcmMock,
  resetDb,
  seedHcmConfig,
  startMockServer,
  stopMockServer,
  DEFAULT_KEY,
} from './setup';
import { typedQuery } from '../helpers/db-query';

describe('RG-2: approve re-reads balance after external HCM mutation', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    await startMockServer();
    ({ app, dataSource } = await buildTestModule());
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

  it('approval fails with INSUFFICIENT_BALANCE when balance drained after submit', async () => {
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
        startDate: '2024-03-01',
        endDate: '2024-03-05',
        requestedHours: 80,
        submittedById: 'emp-1',
        managerId: 'mgr-1',
      })
      .expect(201);

    const { externalId } = submitRes.body as { externalId: string };

    // drain the HCM balance to 0 after submit but before approve
    await hcmMock.mutate(DEFAULT_KEY, 0);

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(422);

    expect((res.body as { code: string }).code).toBe('INSUFFICIENT_BALANCE');

    // DB should still be PENDING — the approve path did not commit
    const rows = await typedQuery<{ status: string }>(
      dataSource,
      'SELECT status FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('PENDING');

    // no HCM debit was made
    const debits = await hcmMock.getDebits();
    expect(Object.keys(debits)).toHaveLength(0);
  });
});
