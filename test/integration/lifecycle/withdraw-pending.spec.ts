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

describe('POST /requests/:externalId/withdraw (PENDING)', () => {
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

  it('withdraw PENDING — 200 WITHDRAWN, no HCM call, state transition recorded, notifyEmployee called', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const notifications = module.get(NotificationsService);
    const spy = jest.spyOn(notifications, 'notifyEmployee');

    const externalId = await submitRequest(app);

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/withdraw`)
      .send({ actorId: 'emp-1' })
      .expect(200);

    expect((res.body as { status: string }).status).toBe('WITHDRAWN');

    const debits = await hcmMock.getDebits();
    expect(Object.keys(debits)).toHaveLength(0);

    const rows = await typedQuery<{ id: number; status: string }>(
      dataSource,
      'SELECT * FROM time_off_requests WHERE externalId = ?',
      [externalId],
    );
    expect(rows[0].status).toBe('WITHDRAWN');

    const transitions = await typedQuery<{
      toState: string;
      fromState: string;
      actorId: string;
    }>(
      dataSource,
      'SELECT * FROM request_state_transitions WHERE requestId = ?',
      [rows[0].id],
    );
    const withdrawT = transitions.find((t) => t.toState === 'WITHDRAWN');
    expect(withdrawT?.fromState).toBe('PENDING');
    expect(withdrawT?.actorId).toBe('emp-1');

    const withdrawCalls = spy.mock.calls.filter((c) => c[1] === 'WITHDRAWN');
    expect(withdrawCalls).toHaveLength(1);
    expect(withdrawCalls[0]).toEqual([
      DEFAULT_KEY.employeeId,
      'WITHDRAWN',
      externalId,
    ]);

    spy.mockRestore();
  });

  it('re-withdraw already WITHDRAWN — 200 idempotent', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const externalId = await submitRequest(app);
    await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/withdraw`)
      .send({ actorId: 'emp-1' })
      .expect(200);

    const res = await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/withdraw`)
      .send({ actorId: 'emp-1' })
      .expect(200);

    expect((res.body as { status: string }).status).toBe('WITHDRAWN');
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
      .post(`/requests/${externalId}/withdraw`)
      .send({ actorId: 'emp-1' })
      .expect(409);

    expect((res.body as { code: string }).code).toBe('INVALID_TRANSITION');
  });

  it('not found returns 404', async () => {
    const res = await request(app.getHttpServer() as Server)
      .post('/requests/does-not-exist/withdraw')
      .send({ actorId: 'emp-1' })
      .expect(404);

    expect((res.body as { code: string }).code).toBe('NOT_FOUND');
  });
});
