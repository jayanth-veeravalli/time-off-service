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

describe('RG-6: service enforces balance check even when HCM would silently accept', () => {
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

  it('submit returns 422 INSUFFICIENT_BALANCE even in SILENT_ACCEPT mode with 0 balance', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 0);
    await hcmMock.configure('SILENT_ACCEPT');

    const res = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send({
        employeeId: DEFAULT_KEY.employeeId,
        employerId: DEFAULT_KEY.employerId,
        locationId: DEFAULT_KEY.locationId,
        leaveType: DEFAULT_KEY.leaveType,
        year: DEFAULT_KEY.year,
        startDate: '2024-03-01',
        endDate: '2024-03-05',
        requestedHours: 8,
        submittedById: 'emp-1',
        managerId: 'mgr-1',
      })
      .expect(422);

    expect((res.body as { code: string }).code).toBe('INSUFFICIENT_BALANCE');

    // no DB row created
    const rows = await typedQuery<Record<string, unknown>>(
      dataSource,
      'SELECT * FROM time_off_requests',
    );
    expect(rows).toHaveLength(0);

    // debitBalance never called
    const debits = await hcmMock.getDebits();
    expect(Object.keys(debits)).toHaveLength(0);
  });
});
