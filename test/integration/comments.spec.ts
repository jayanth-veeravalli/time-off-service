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

async function submitRequest(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer()).post('/requests').send(SUBMIT_BODY).expect(201);
  return (res.body as { externalId: string }).externalId;
}

describe('comments endpoints', () => {
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

  it('POST /requests/:externalId/comments creates comment, returns 201 with full shape', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);
    const externalId = await submitRequest(app);

    const res = await request(app.getHttpServer())
      .post(`/requests/${externalId}/comments`)
      .send({ authorId: 'mgr-1', authorType: 'MANAGER', body: 'Looks good' })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.authorId).toBe('mgr-1');
    expect(res.body.authorType).toBe('MANAGER');
    expect(res.body.body).toBe('Looks good');
    expect(res.body.createdAt).toBeDefined();
  });

  it('GET /requests/:externalId/comments returns all comments in order', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);
    const externalId = await submitRequest(app);

    await request(app.getHttpServer())
      .post(`/requests/${externalId}/comments`)
      .send({ authorId: 'emp-1', authorType: 'EMPLOYEE', body: 'First comment' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/requests/${externalId}/comments`)
      .send({ authorId: 'mgr-1', authorType: 'MANAGER', body: 'Second comment' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/requests/${externalId}/comments`)
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body[0].body).toBe('First comment');
    expect(res.body[1].body).toBe('Second comment');
  });

  it('POST comment to nonexistent request returns 404', async () => {
    const res = await request(app.getHttpServer())
      .post('/requests/does-not-exist/comments')
      .send({ authorId: 'mgr-1', authorType: 'MANAGER', body: 'Hello' })
      .expect(404);

    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('GET comments for nonexistent request returns 404', async () => {
    const res = await request(app.getHttpServer())
      .get('/requests/does-not-exist/comments')
      .expect(404);

    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('both EMPLOYEE and MANAGER authorTypes are accepted', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);
    const externalId = await submitRequest(app);

    await request(app.getHttpServer())
      .post(`/requests/${externalId}/comments`)
      .send({ authorId: 'emp-1', authorType: 'EMPLOYEE', body: 'Employee comment' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/requests/${externalId}/comments`)
      .send({ authorId: 'mgr-1', authorType: 'MANAGER', body: 'Manager comment' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/requests/${externalId}/comments`)
      .expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body.map((c: { authorType: string }) => c.authorType)).toEqual(
      expect.arrayContaining(['EMPLOYEE', 'MANAGER']),
    );
  });
});
