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
} from '../setup';
import { makeSubmitBody } from '../../helpers/factories';
import { typedQuery } from '../../helpers/db-query';

const SUBMIT_BODY = makeSubmitBody({ ...DEFAULT_KEY });

async function submitAndApprove(app: INestApplication): Promise<string> {
  const submitRes = await request(app.getHttpServer() as Server)
    .post('/requests')
    .send(SUBMIT_BODY)
    .expect(201);
  const { externalId } = submitRes.body as { externalId: string };
  await request(app.getHttpServer() as Server)
    .post(`/requests/${externalId}/approve`)
    .send({ actorId: 'mgr-1' })
    .expect(200);
  return externalId;
}

describe('POST /requests/:externalId/withdraw (APPROVED)', () => {
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

  it('withdraw APPROVED — reverseDebit called with correct externalId (RG-9), DB is WITHDRAWN', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitAndApprove(app);

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/withdraw`)
      .send({ actorId: 'emp-1' })
      .expect(200);

    expect((res.body as { status: string }).status).toBe('WITHDRAWN');

    // reversal removed the debit entry from the mock
    const debits = await hcmMock.getDebits();
    expect(debits[externalId]).toBeUndefined();

    const rows = await typedQuery<{ id: number; status: string }>(
      dataSource,
      'SELECT * FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('WITHDRAWN');

    const transitions = await typedQuery<{
      toState: string;
      fromState: string;
    }>(
      dataSource,
      'SELECT * FROM request_state_transitions WHERE requestId = ?',
      [rows[0].id],
    );
    const withdrawT = transitions.find((t) => t.toState === 'WITHDRAWN');
    expect(withdrawT?.fromState).toBe('APPROVED');
  });

  it('HCM reversal returns 503 — 503 HCM_UNAVAILABLE, DB stays APPROVED (RG-3b)', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitAndApprove(app);

    await hcmMock.configure('SERVER_ERROR');

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/withdraw`)
      .send({ actorId: 'emp-1' })
      .expect(503);

    expect((res.body as { code: string }).code).toBe('HCM_UNAVAILABLE');

    const rows = await typedQuery<{ status: string }>(
      dataSource,
      'SELECT status FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('APPROVED');
  });

  it('HCM reversal returns 422 domain error — 422 HCM_ERROR, DB stays APPROVED', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitAndApprove(app);

    await hcmMock.configure('REVERSAL_ERROR');

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/withdraw`)
      .send({ actorId: 'emp-1' })
      .expect(422);

    expect((res.body as { code: string }).code).toBe('HCM_ERROR');

    const rows = await typedQuery<{ status: string }>(
      dataSource,
      'SELECT status FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('APPROVED');
  });
});
