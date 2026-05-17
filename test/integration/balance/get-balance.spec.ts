import type { Server } from 'http';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  buildTestModule,
  hcmMock,
  resetDb,
  seedHcmConfig,
  startMockServer,
  stopMockServer,
  DEFAULT_KEY,
} from '../setup';

const BALANCE_QUERY = {
  employerId: DEFAULT_KEY.employerId,
  locationId: DEFAULT_KEY.locationId,
  leaveType: DEFAULT_KEY.leaveType,
  year: String(DEFAULT_KEY.year),
};

describe('GET /employees/:employeeId/balance', () => {
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
  });

  it('valid request returns 200 with correct balanceHours', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 168);

    const res = await request(app.getHttpServer() as Server)
      .get(`/employees/${DEFAULT_KEY.employeeId}/balance`)
      .query(BALANCE_QUERY)
      .expect(200);

    const body = res.body as {
      balanceHours: number;
      employeeId: string;
      employerId: string;
    };
    expect(body.balanceHours).toBe(168);
    expect(body.employeeId).toBe(DEFAULT_KEY.employeeId);
    expect(body.employerId).toBe(DEFAULT_KEY.employerId);
  });

  it('no HCM config for employerId returns 422 HCM_CONFIG_NOT_FOUND', async () => {
    // intentionally skip seedHcmConfig
    const res = await request(app.getHttpServer() as Server)
      .get(`/employees/${DEFAULT_KEY.employeeId}/balance`)
      .query(BALANCE_QUERY)
      .expect(422);

    expect((res.body as { code: string }).code).toBe('HCM_CONFIG_NOT_FOUND');
  });

  it('HCM returns 503 → 503 HCM_UNAVAILABLE', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.configure('SERVER_ERROR');

    const res = await request(app.getHttpServer() as Server)
      .get(`/employees/${DEFAULT_KEY.employeeId}/balance`)
      .query(BALANCE_QUERY)
      .expect(503);

    expect((res.body as { code: string }).code).toBe('HCM_UNAVAILABLE');
  });

  it('HCM returns 4xx → 422 HCM_ERROR', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.configure('INVALID_DIMENSIONS');

    const res = await request(app.getHttpServer() as Server)
      .get(`/employees/${DEFAULT_KEY.employeeId}/balance`)
      .query(BALANCE_QUERY)
      .expect(422);

    expect((res.body as { code: string }).code).toBe('HCM_ERROR');
  });

  it('missing required query param (year) returns 400', async () => {
    const queryWithoutYear = {
      employerId: DEFAULT_KEY.employerId,
      locationId: DEFAULT_KEY.locationId,
      leaveType: DEFAULT_KEY.leaveType,
    };

    await request(app.getHttpServer() as Server)
      .get(`/employees/${DEFAULT_KEY.employeeId}/balance`)
      .query(queryWithoutYear)
      .expect(400);
  });
});
