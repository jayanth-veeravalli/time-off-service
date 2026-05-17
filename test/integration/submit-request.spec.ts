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

describe('POST /requests (submit)', () => {
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

  it('valid submit returns 201 with PENDING status and records a state transition', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const res = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send(SUBMIT_BODY)
      .expect(201);

    const body = res.body as {
      externalId: string;
      status: string;
      employeeId: string;
      requestedHours: number;
      createdAt: string;
    };
    expect(body.externalId).toBe('00000000-0000-0000-0000-000000000001');
    expect(body.status).toBe('PENDING');
    expect(body.employeeId).toBe(SUBMIT_BODY.employeeId);
    expect(body.requestedHours).toBe(40);
    expect(body.createdAt).toBeDefined();

    const rows = await typedQuery<{ id: number; status: string }>(
      dataSource,
      'SELECT * FROM time_off_requests WHERE externalId = ?',
      [body.externalId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('PENDING');

    const transitions = await typedQuery<{
      fromState: string | null;
      toState: string;
      actorId: string;
    }>(
      dataSource,
      'SELECT * FROM request_state_transitions WHERE requestId = ?',
      [rows[0].id],
    );
    expect(transitions).toHaveLength(1);
    expect(transitions[0].fromState).toBeNull();
    expect(transitions[0].toState).toBe('PENDING');
    expect(transitions[0].actorId).toBe(SUBMIT_BODY.submittedById);
  });

  it('overlapping PENDING request returns 409 OVERLAP_CONFLICT', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    await request(app.getHttpServer() as Server)
      .post('/requests')
      .send(SUBMIT_BODY)
      .expect(201);
    deterministicUuid.reset();

    const res = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send({ ...SUBMIT_BODY, startDate: '2024-03-03', endDate: '2024-03-07' })
      .expect(409);

    expect((res.body as { code: string }).code).toBe('OVERLAP_CONFLICT');
  });

  it('overlapping APPROVED request returns 409 OVERLAP_CONFLICT', async () => {
    await seedHcmConfig(dataSource);
    await dataSource.query(
      `INSERT INTO time_off_requests
         (externalId, employeeId, employerId, locationId, leaveType, year,
          startDate, endDate, requestedHours, status, submittedById, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?, datetime('now'), datetime('now'))`,
      [
        'existing-approved-001',
        SUBMIT_BODY.employeeId,
        SUBMIT_BODY.employerId,
        SUBMIT_BODY.locationId,
        SUBMIT_BODY.leaveType,
        SUBMIT_BODY.year,
        '2024-03-01',
        '2024-03-05',
        40,
        SUBMIT_BODY.submittedById,
      ],
    );

    await hcmMock.seed(DEFAULT_KEY, 80);

    const res = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send(SUBMIT_BODY)
      .expect(409);

    expect((res.body as { code: string }).code).toBe('OVERLAP_CONFLICT');
  });

  it('requested hours exceed available balance returns 422 INSUFFICIENT_BALANCE', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 20);

    const res = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send(SUBMIT_BODY)
      .expect(422);

    expect((res.body as { code: string }).code).toBe('INSUFFICIENT_BALANCE');

    const rows = await typedQuery<Record<string, unknown>>(
      dataSource,
      'SELECT * FROM time_off_requests',
    );
    expect(rows).toHaveLength(0);
  });

  it('no HCM config for employerId returns 422 HCM_CONFIG_NOT_FOUND', async () => {
    // intentionally skip seedHcmConfig
    const res = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send(SUBMIT_BODY)
      .expect(422);

    expect((res.body as { code: string }).code).toBe('HCM_CONFIG_NOT_FOUND');
  });

  it('HCM getBalance returns 5xx → 503 HCM_UNAVAILABLE, no DB write', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.configure('SERVER_ERROR');

    const res = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send(SUBMIT_BODY)
      .expect(503);

    expect((res.body as { code: string }).code).toBe('HCM_UNAVAILABLE');

    const rows = await typedQuery<Record<string, unknown>>(
      dataSource,
      'SELECT * FROM time_off_requests',
    );
    expect(rows).toHaveLength(0);
  });

  it('HCM getBalance returns 4xx → 422 HCM_ERROR, no DB write', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.configure('INVALID_DIMENSIONS');

    const res = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send(SUBMIT_BODY)
      .expect(422);

    expect((res.body as { code: string }).code).toBe('HCM_ERROR');

    const rows = await typedQuery<Record<string, unknown>>(
      dataSource,
      'SELECT * FROM time_off_requests',
    );
    expect(rows).toHaveLength(0);
  });
});
