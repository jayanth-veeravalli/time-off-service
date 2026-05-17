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

describe('RG-1: concurrent submits cannot overdraw balance', () => {
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

  it('two concurrent 40h submits against a 40h balance — exactly one succeeds', async () => {
    await seedHcmConfig(dataSource);
    // Balance covers exactly one 40h request
    await hcmMock.seed(DEFAULT_KEY, 40);

    const submitA = {
      employeeId: DEFAULT_KEY.employeeId,
      employerId: DEFAULT_KEY.employerId,
      locationId: DEFAULT_KEY.locationId,
      leaveType: DEFAULT_KEY.leaveType,
      year: DEFAULT_KEY.year,
      startDate: '2024-03-01',
      endDate: '2024-03-05',
      requestedHours: 40,
      submittedById: 'emp-1',
      managerId: 'mgr-1',
    };
    const submitB = {
      ...submitA,
      // non-overlapping date range so the race is decided by the balance lock, not overlap
      startDate: '2024-04-01',
      endDate: '2024-04-05',
    };

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer() as Server)
        .post('/requests')
        .send(submitA),
      request(app.getHttpServer() as Server)
        .post('/requests')
        .send(submitB),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // One accepted, one rejected
    expect(statuses).toEqual([201, 422]);

    const failedRes = resA.status === 422 ? resA : resB;
    expect((failedRes.body as { code: string }).code).toBe(
      'INSUFFICIENT_BALANCE',
    );

    // No debit: neither request has been approved yet
    const debits = await hcmMock.getDebits();
    expect(Object.keys(debits)).toHaveLength(0);

    // Exactly one request in DB
    const rows = await typedQuery<{ status: string }>(
      dataSource,
      'SELECT * FROM time_off_requests WHERE employeeId = ?',
      [DEFAULT_KEY.employeeId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('PENDING');
  });
});
