import type { Server } from 'http';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../../src/notifications/notifications.service';
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

describe('POST /requests/:externalId/reject', () => {
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

  it('reject PENDING request — 200 REJECTED, state transition recorded, no HCM call', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/reject`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    expect((res.body as { status: string }).status).toBe('REJECTED');

    const rows = await typedQuery<{ id: number; status: string }>(
      dataSource,
      'SELECT * FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('REJECTED');

    const transitions = await typedQuery<{
      toState: string;
      fromState: string;
      actorId: string;
    }>(
      dataSource,
      'SELECT * FROM request_state_transitions WHERE requestId = ?',
      [rows[0].id],
    );
    const rejectT = transitions.find((t) => t.toState === 'REJECTED');
    expect(rejectT?.fromState).toBe('PENDING');
    expect(rejectT?.actorId).toBe('mgr-1');

    // no HCM debit
    const debits = await hcmMock.getDebits();
    expect(Object.keys(debits)).toHaveLength(0);
  });

  it('reject with comment — comment inserted in request_comments', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/reject`)
      .send({ actorId: 'mgr-1', comment: 'Not approved due to team capacity' })
      .expect(200);

    const comments = await typedQuery<{
      body: string;
      authorId: string;
      authorType: string;
    }>(
      dataSource,
      `SELECT rc.* FROM request_comments rc
       JOIN time_off_requests r ON r.id = rc.requestId
       WHERE r.externalId = ?`,
      [externalId],
    );
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe('Not approved due to team capacity');
    expect(comments[0].authorId).toBe('mgr-1');
    expect(comments[0].authorType).toBe('MANAGER');
  });

  it('re-reject already REJECTED — 200 idempotent', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const notifications = module.get(NotificationsService);
    const spy = jest.spyOn(notifications, 'notifyEmployee');

    const externalId = await submitRequest(app);

    await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/reject`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    const callsAfterFirst = spy.mock.calls.filter(
      (c) => c[1] === 'REJECTED',
    ).length;
    expect(callsAfterFirst).toBe(1);

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/reject`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    expect((res.body as { status: string }).status).toBe('REJECTED');

    // notifyEmployee should not be called again on idempotent re-reject
    const totalRejectedCalls = spy.mock.calls.filter(
      (c) => c[1] === 'REJECTED',
    ).length;
    expect(totalRejectedCalls).toBe(1);

    spy.mockRestore();
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
      .post(`/requests/${externalId}/reject`)
      .send({ actorId: 'mgr-1' })
      .expect(409);

    expect((res.body as { code: string }).code).toBe('INVALID_TRANSITION');
  });

  it('not found returns 404', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/requests/does-not-exist/reject')
      .send({ actorId: 'mgr-1' })
      .expect(404);

    expect((res.body as { code: string }).code).toBe('NOT_FOUND');
  });

  it('notifyEmployee called with REJECTED status after DB write', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const notifications = module.get(NotificationsService);
    const spy = jest.spyOn(notifications, 'notifyEmployee');

    const externalId = await submitRequest(app);

    await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/reject`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    expect(spy).toHaveBeenCalledWith(
      SUBMIT_BODY.employeeId,
      'REJECTED',
      externalId,
    );

    spy.mockRestore();
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
      .post(`/requests/${externalId}/reject`)
      .send({ actorId: 'mgr-1' })
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
      .post(`/requests/${externalId}/reject`)
      .send({ actorId: 'mgr-1' })
      .expect(409);

    expect((res.body as { code: string }).code).toBe('INVALID_TRANSITION');
  });
});
