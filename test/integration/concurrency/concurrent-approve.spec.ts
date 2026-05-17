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
import { typedQuery } from '../../helpers/db-query';
import { makeSubmitBody } from '../../helpers/factories';

describe('RG-1: concurrent submits cannot overdraw balance', () => {
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

  it('two concurrent 40h submits against a 40h balance — exactly one succeeds', async () => {
    await seedHcmConfig(dataSource);
    // Balance covers exactly one 40h request
    await hcmMock.seed(DEFAULT_KEY, 40);

    const submitA = {
      employeeId: DEFAULT_KEY.employeeId,
      employerId: DEFAULT_KEY.employerId,
      locationId: DEFAULT_KEY.locationId,
      leaveType: DEFAULT_KEY.leaveType,
      year: DEFAULT_KEY.year,
      startDate: '2024-03-01',
      endDate: '2024-03-05',
      requestedHours: 40,
      submittedById: 'emp-1',
      managerId: 'mgr-1',
    };
    const submitB = {
      ...submitA,
      // non-overlapping date range so the race is decided by the balance lock, not overlap
      startDate: '2024-04-01',
      endDate: '2024-04-05',
    };

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer() as Server)
        .post('/requests')
        .send(submitA),
      request(app.getHttpServer() as Server)
        .post('/requests')
        .send(submitB),
    ]);

    const statuses = [resA.status, resB.status].sort();
    // One accepted, one rejected
    expect(statuses).toEqual([201, 422]);

    const failedRes = resA.status === 422 ? resA : resB;
    expect((failedRes.body as { code: string }).code).toBe(
      'INSUFFICIENT_BALANCE',
    );

    // No debit: neither request has been approved yet
    const debits = await hcmMock.getDebits();
    expect(Object.keys(debits)).toHaveLength(0);

    // Exactly one request in DB
    const rows = await typedQuery<{ status: string }>(
      dataSource,
      'SELECT * FROM time_off_requests WHERE employeeId = ?',
      [DEFAULT_KEY.employeeId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('PENDING');
  });
});

describe('RG-7b: concurrent approvals of the same request — idempotency guard inside lock', () => {
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

  it('two concurrent approvals of the same request — both return 200, debit called exactly once', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const submitRes = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send(makeSubmitBody({ ...DEFAULT_KEY }))
      .expect(201);
    const externalId = (submitRes.body as { externalId: string }).externalId;

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer() as Server)
        .post(`/requests/${externalId}/approve`)
        .send({ actorId: 'mgr-1' }),
      request(app.getHttpServer() as Server)
        .post(`/requests/${externalId}/approve`)
        .send({ actorId: 'mgr-1' }),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect((resA.body as { status: string }).status).toBe('APPROVED');
    expect((resB.body as { status: string }).status).toBe('APPROVED');

    const debits = await hcmMock.getDebits();
    expect(debits[externalId]).toBe(40);
    expect(Object.keys(debits)).toHaveLength(1);
  });
});

describe('RG-7c: concurrent withdrawals of the same APPROVED request — idempotency guard inside lock', () => {
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

  it('two concurrent withdrawals of the same APPROVED request — both return 200, reversal called exactly once', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const submitRes = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send(makeSubmitBody({ ...DEFAULT_KEY }))
      .expect(201);
    const externalId = (submitRes.body as { externalId: string }).externalId;

    await request(app.getHttpServer() as Server)
      .post(`/requests/${externalId}/approve`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    const debitsBefore = await hcmMock.getDebits();
    expect(debitsBefore[externalId]).toBe(40);

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer() as Server)
        .post(`/requests/${externalId}/withdraw`)
        .send({ actorId: 'emp-1' }),
      request(app.getHttpServer() as Server)
        .post(`/requests/${externalId}/withdraw`)
        .send({ actorId: 'emp-1' }),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    expect((resA.body as { status: string }).status).toBe('WITHDRAWN');
    expect((resB.body as { status: string }).status).toBe('WITHDRAWN');

    // reversal removes the debit entry — must be absent (not double-reversed)
    const debitsAfter = await hcmMock.getDebits();
    expect(debitsAfter[externalId]).toBeUndefined();
  });
});

describe('RG-1b: concurrent approvals on the same employee cannot both debit', () => {
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

  it('two concurrent 25h approvals against a 40h balance — balance invariant holds (no overdraft)', async () => {
    await seedHcmConfig(dataSource);
    // Seed 80h so both submits pass the pending-hours check during submit
    await hcmMock.seed(DEFAULT_KEY, 80);

    const BASE_BODY = makeSubmitBody({ ...DEFAULT_KEY });

    // Submit request A — gets UUID 000...0001
    const resA = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send({
        ...BASE_BODY,
        startDate: '2024-03-01',
        endDate: '2024-03-05',
        requestedHours: 25,
      })
      .expect(201);
    const externalIdA = (resA.body as { externalId: string }).externalId;

    // Submit request B (non-overlapping dates) — counter advances naturally, gets UUID 000...0002
    const resB = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send({
        ...BASE_BODY,
        startDate: '2024-04-01',
        endDate: '2024-04-05',
        requestedHours: 25,
      })
      .expect(201);
    const externalIdB = (resB.body as { externalId: string }).externalId;

    // Mutate balance to 40h — individually each request (25h) fits, but together (50h) they exceed it
    await hcmMock.mutate(DEFAULT_KEY, 40);

    // Fire both approve calls concurrently
    const [approveResA, approveResB] = await Promise.all([
      request(app.getHttpServer() as Server)
        .post(`/requests/${externalIdA}/approve`)
        .send({ actorId: 'mgr-1' }),
      request(app.getHttpServer() as Server)
        .post(`/requests/${externalIdB}/approve`)
        .send({ actorId: 'mgr-1' }),
    ]);

    const statuses = [approveResA.status, approveResB.status].sort();

    // The balance invariant: at most one should be approved (both failing is also acceptable
    // since combined they exceed the 40h balance — the service blocks both to prevent overdraft)
    expect(statuses.filter((s) => s === 200)).toHaveLength(
      statuses.includes(200) ? 1 : 0,
    );

    // No overdraft: debits committed must not exceed balance
    const debits = await hcmMock.getDebits();
    const totalDebited = Object.values(debits).reduce((a, b) => a + b, 0);
    expect(totalDebited).toBeLessThanOrEqual(40);

    // DB state is consistent: any APPROVED row must have a matching debit
    const rows = await typedQuery<{ status: string; externalId: string }>(
      dataSource,
      'SELECT status, externalId FROM time_off_requests WHERE employeeId = ?',
      [DEFAULT_KEY.employeeId],
    );
    expect(rows).toHaveLength(2);
    const approvedRows = rows.filter((r) => r.status === 'APPROVED');
    for (const row of approvedRows) {
      expect(debits[row.externalId]).toBeDefined();
    }
  });
});
