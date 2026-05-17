import request = require('supertest');
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

const SUBMIT_BODY = makeSubmitBody({ ...DEFAULT_KEY });

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

    const submitRes = await request(app.getHttpServer())
      .post('/requests')
      .send(SUBMIT_BODY)
      .expect(201);

    const { externalId } = submitRes.body as { externalId: string };

    const res = await request(app.getHttpServer())
      .get(`/requests/${externalId}`)
      .expect(200);

    expect(res.body.externalId).toBe(externalId);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.employeeId).toBe(SUBMIT_BODY.employeeId);
    expect(res.body.requestedHours).toBe(40);
    expect(res.body.transitions).toHaveLength(1);
    expect(res.body.transitions[0].toState).toBe('PENDING');
    expect(res.body.transitions[0].fromState).toBeNull();
  });

  it('nonexistent externalId returns 404 NOT_FOUND', async () => {
    const res = await request(app.getHttpServer())
      .get('/requests/does-not-exist')
      .expect(404);

    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('after approve, transitions array contains PENDING→APPROVED entry', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const submitRes = await request(app.getHttpServer())
      .post('/requests')
      .send(SUBMIT_BODY)
      .expect(201);

    const { externalId } = submitRes.body as { externalId: string };

    await request(app.getHttpServer())
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/requests/${externalId}`)
      .expect(200);

    expect(res.body.status).toBe('APPROVED');
    expect(res.body.transitions).toHaveLength(2);

    const approveTransition = res.body.transitions.find(
      (t: { toState: string }) => t.toState === 'APPROVED',
    );
    expect(approveTransition.fromState).toBe('PENDING');
    expect(approveTransition.actorId).toBe('mgr-1');
  });
});
