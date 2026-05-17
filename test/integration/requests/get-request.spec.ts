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

const SUBMIT_BODY = makeSubmitBody({ ...DEFAULT_KEY });

interface Transition {
  toState: string;
  fromState: string;
  actorId: string;
}

interface GetRequestBody {
  externalId: string;
  status: string;
  employeeId: string;
  requestedHours: number;
  transitions: Transition[];
}

describe('GET /requests/:externalId', () => {
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

  it('existing request returns 200 with full shape including transitions array', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const submitRes = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send(SUBMIT_BODY)
      .expect(201);

    const { externalId } = submitRes.body as { externalId: string };

    const res = await request(app.getHttpServer() as Server)
      .get(`/requests/${externalId}`)
      .expect(200);

    const body = res.body as GetRequestBody;
    expect(body.externalId).toBe(externalId);
    expect(body.status).toBe('PENDING');
    expect(body.employeeId).toBe(SUBMIT_BODY.employeeId);
    expect(body.requestedHours).toBe(40);
    expect(body.transitions).toHaveLength(1);
    expect(body.transitions[0].toState).toBe('PENDING');
    expect(body.transitions[0].fromState).toBeNull();
  });

  it('nonexistent externalId returns 404 NOT_FOUND', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/requests/does-not-exist')
      .expect(404);

    expect((res.body as { code: string }).code).toBe('NOT_FOUND');
  });

  it('after approve, transitions array contains PENDING→APPROVED entry', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const submitRes = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send(SUBMIT_BODY)
      .expect(201);

    const { externalId } = submitRes.body as { externalId: string };

    await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    const res = await request(app.getHttpServer() as Server)
      .get(`/requests/${externalId}`)
      .expect(200);

    const body = res.body as GetRequestBody;
    expect(body.status).toBe('APPROVED');
    expect(body.transitions).toHaveLength(2);

    const approveTransition = body.transitions.find(
      (t) => t.toState === 'APPROVED',
    );
    expect(approveTransition?.fromState).toBe('PENDING');
    expect(approveTransition?.actorId).toBe('mgr-1');
  });
});
