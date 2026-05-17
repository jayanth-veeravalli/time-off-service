import type { Server } from 'http';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  buildTestModule,
  deterministicUuid,
  hcmMock,
  resetDb,
  startMockServer,
  stopMockServer,
  DEFAULT_KEY,
} from '../setup';
import { makeSubmitBody } from '../../helpers/factories';
import { typedQuery } from '../../helpers/db-query';

const SUBMIT_BODY = makeSubmitBody({ ...DEFAULT_KEY });

describe('RG-5: no HCM config returns HCM_CONFIG_NOT_FOUND', () => {
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

  it('submit with unconfigured employerId returns 422 HCM_CONFIG_NOT_FOUND, no DB write', async () => {
    // no seedHcmConfig — employer has no HCM config

    const res = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send(SUBMIT_BODY)
      .expect(422);

    expect((res.body as { code: string }).code).toBe('HCM_CONFIG_NOT_FOUND');

    const rows = await typedQuery<Record<string, unknown>>(
      dataSource,
      'SELECT * FROM time_off_requests',
    );
    expect(rows).toHaveLength(0);

    const debits = await hcmMock.getDebits();
    expect(Object.keys(debits)).toHaveLength(0);
  });

  it('balance endpoint with unconfigured employerId returns 422 HCM_CONFIG_NOT_FOUND', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get(`/employees/${DEFAULT_KEY.employeeId}/balance`)
      .query({
        employerId: DEFAULT_KEY.employerId,
        locationId: DEFAULT_KEY.locationId,
        leaveType: DEFAULT_KEY.leaveType,
        year: String(DEFAULT_KEY.year),
      })
      .expect(422);

    expect((res.body as { code: string }).code).toBe('HCM_CONFIG_NOT_FOUND');
  });
});
