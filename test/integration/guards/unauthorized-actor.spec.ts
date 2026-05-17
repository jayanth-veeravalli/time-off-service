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

async function submitRequest(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer() as Server)
    .post('/requests')
    .send(SUBMIT_BODY)
    .expect(201);
  return (res.body as { externalId: string }).externalId;
}

describe('RG-12: UNAUTHORIZED_ACTOR — non-manager cannot approve or reject', () => {
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

  it('approve by wrong actor returns 403 UNAUTHORIZED_ACTOR, request stays PENDING', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'emp-2' })
      .expect(403);

    expect((res.body as { code: string }).code).toBe('UNAUTHORIZED_ACTOR');

    const debits = await hcmMock.getDebits();
    expect(Object.keys(debits)).toHaveLength(0);

    const rows = await typedQuery<{ status: string }>(
      dataSource,
      'SELECT status FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('PENDING');
  });

  it('reject by wrong actor returns 403 UNAUTHORIZED_ACTOR, request stays PENDING', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/reject`)
      .send({ actorId: 'emp-2' })
      .expect(403);

    expect((res.body as { code: string }).code).toBe('UNAUTHORIZED_ACTOR');

    const rows = await typedQuery<{ status: string }>(
      dataSource,
      'SELECT status FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('PENDING');
  });

  it('approve by the correct manager succeeds — 200 APPROVED', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    expect((res.body as { status: string }).status).toBe('APPROVED');
  });
});
