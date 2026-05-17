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
import { makeSubmitBody } from '../helpers/factories';
import { typedQuery } from '../helpers/db-query';

const SUBMIT_BODY = makeSubmitBody({ ...DEFAULT_KEY });

async function submitRequest(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer() as Server)
    .post('/requests')
    .send(SUBMIT_BODY)
    .expect(201);
  return (res.body as { externalId: string }).externalId;
}

describe('RG-14: PATCH /requests/:externalId/manager — re-assign manager', () => {
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

  it('PENDING request — 200, managerId updated in DB', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    const res = await request(app.getHttpServer() as Server)
      .patch(`/requests/${externalId}/manager`)
      .send({ managerId: 'mgr-2' })
      .expect(200);

    expect((res.body as { managerId: string }).managerId).toBe('mgr-2');

    const rows = await typedQuery<{ managerId: string }>(
      dataSource,
      'SELECT managerId FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].managerId).toBe('mgr-2');
  });

  it('APPROVED request returns 409 INVALID_TRANSITION', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);
    await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    const res = await request(app.getHttpServer() as Server)
      .patch(`/requests/${externalId}/manager`)
      .send({ managerId: 'mgr-2' })
      .expect(409);

    expect((res.body as { code: string }).code).toBe('INVALID_TRANSITION');
  });

  it('non-existent request returns 404 NOT_FOUND', async () => {
    const res = await request(app.getHttpServer() as Server)
      .patch('/requests/does-not-exist/manager')
      .send({ managerId: 'mgr-2' })
      .expect(404);

    expect((res.body as { code: string }).code).toBe('NOT_FOUND');
  });

  it('empty managerId body returns 400', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    await request(app.getHttpServer() as Server)
      .patch(`/requests/${externalId}/manager`)
      .send({ managerId: '' })
      .expect(400);
  });

  it('REJECTED request returns 409 INVALID_TRANSITION', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/reject`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    const res = await request(app.getHttpServer() as Server)
      .patch(`/requests/${externalId}/manager`)
      .send({ managerId: 'mgr-2' })
      .expect(409);

    expect((res.body as { code: string }).code).toBe('INVALID_TRANSITION');
  });

  it('WITHDRAWN request returns 409 INVALID_TRANSITION', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/withdraw`)
      .send({ actorId: 'emp-1' })
      .expect(200);

    const res = await request(app.getHttpServer() as Server)
      .patch(`/requests/${externalId}/manager`)
      .send({ managerId: 'mgr-2' })
      .expect(409);

    expect((res.body as { code: string }).code).toBe('INVALID_TRANSITION');
  });

  it('CANCELLED request returns 409 INVALID_TRANSITION', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    await dataSource.query(
      `UPDATE time_off_requests SET status = 'CANCELLED' WHERE externalId = ?`,
      [externalId],
    );

    const res = await request(app.getHttpServer() as Server)
      .patch(`/requests/${externalId}/manager`)
      .send({ managerId: 'mgr-2' })
      .expect(409);

    expect((res.body as { code: string }).code).toBe('INVALID_TRANSITION');
  });
});
