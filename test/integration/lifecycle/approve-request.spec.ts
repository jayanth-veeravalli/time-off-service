import type { Server } from 'http';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TestingModule } from '@nestjs/testing';
import { NotificationsService } from '../../../src/notifications/notifications.service';
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

describe('POST /requests/:externalId/approve', () => {
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

  it('approves PENDING request — 200 APPROVED, HCM debited once, transition recorded', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    expect((res.body as { status: string }).status).toBe('APPROVED');
    expect((res.body as { externalId: string }).externalId).toBe(externalId);

    const debits = await hcmMock.getDebits();
    expect(debits[externalId]).toBe(40);

    const rows = await typedQuery<{ id: number; status: string }>(
      dataSource,
      'SELECT * FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('APPROVED');

    const transitions = await typedQuery<{
      toState: string;
      fromState: string;
      actorId: string;
    }>(
      dataSource,
      'SELECT * FROM request_state_transitions WHERE requestId = ?',
      [rows[0].id],
    );
    const approveT = transitions.find((t) => t.toState === 'APPROVED');
    expect(approveT?.fromState).toBe('PENDING');
    expect(approveT?.actorId).toBe('mgr-1');
  });

  it('request not found returns 404 NOT_FOUND', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/requests/does-not-exist/approve')
      .send({ actorId: 'mgr-1' })
      .expect(404);

    expect((res.body as { code: string }).code).toBe('NOT_FOUND');
  });

  it('already APPROVED — 200 idempotent, debitBalance NOT called again (RG-7)', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const notifications = module.get(NotificationsService);
    const spy = jest.spyOn(notifications, 'notifyEmployee');

    const externalId = await submitRequest(app);

    // first approve — notifyEmployee should be called once
    await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    const callsAfterFirst = spy.mock.calls.filter(
      (c) => c[1] === 'APPROVED',
    ).length;
    expect(callsAfterFirst).toBe(1);

    // second approve — idempotent, notifyEmployee should NOT be called again
    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    expect((res.body as { status: string }).status).toBe('APPROVED');

    const debits = await hcmMock.getDebits();
    expect(debits[externalId]).toBe(40); // still 40, not 80

    // total notifyEmployee call count should still be 1
    const totalApprovedCalls = spy.mock.calls.filter(
      (c) => c[1] === 'APPROVED',
    ).length;
    expect(totalApprovedCalls).toBe(1);

    spy.mockRestore();
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
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
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
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(409);

    expect((res.body as { code: string }).code).toBe('INVALID_TRANSITION');
  });

  it('insufficient balance at approve time returns 422, DB stays PENDING (RG-3)', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    // drain balance to 0 after submit
    await hcmMock.mutate(DEFAULT_KEY, 0);

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(422);

    expect((res.body as { code: string }).code).toBe('INSUFFICIENT_BALANCE');

    const rows = await typedQuery<{ status: string }>(
      dataSource,
      'SELECT status FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('PENDING');
  });

  it('HCM debit fails with 503 — returns 503 HCM_UNAVAILABLE, DB stays PENDING (RG-3)', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    await hcmMock.configure('SERVER_ERROR');

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(503);

    expect((res.body as { code: string }).code).toBe('HCM_UNAVAILABLE');

    const rows = await typedQuery<{ status: string }>(
      dataSource,
      'SELECT status FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('PENDING');
  });

  it('HCM debit returns 4xx domain error — 422 HCM_ERROR, DB stays PENDING', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    await hcmMock.configure('INVALID_DIMENSIONS');

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(422);

    expect((res.body as { code: string }).code).toBe('HCM_ERROR');

    const rows = await typedQuery<{ status: string }>(
      dataSource,
      'SELECT status FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('PENDING');
  });

  it('balance check passes but HCM debit returns 503 — 503 HCM_UNAVAILABLE, DB stays PENDING (RG-3)', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    // getBalance will still return 80 (balance endpoint unaffected); only /debit fails
    await hcmMock.configure('DEBIT_SERVER_ERROR');

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(503);

    expect((res.body as { code: string }).code).toBe('HCM_UNAVAILABLE');

    const rows = await typedQuery<{ status: string }>(
      dataSource,
      'SELECT status FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('PENDING');

    const debits = await hcmMock.getDebits();
    expect(Object.keys(debits)).toHaveLength(0);
  });

  it('ReadyOn balance guard blocks approve even in SILENT_ACCEPT mode (C-6, RG-6b)', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);

    // Drain the HCM balance to 0 after submit
    await hcmMock.mutate(DEFAULT_KEY, 0);

    // HCM would silently accept any debit
    await hcmMock.configure('SILENT_ACCEPT');

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(422);

    expect((res.body as { code: string }).code).toBe('INSUFFICIENT_BALANCE');

    // debitBalance was never called
    const debits = await hcmMock.getDebits();
    expect(Object.keys(debits)).toHaveLength(0);

    const rows = await typedQuery<{ status: string }>(
      dataSource,
      'SELECT status FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('PENDING');
  });
});
