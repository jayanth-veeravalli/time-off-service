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

describe('RG-13: GET /requests — filter by managerId / employeeId / status', () => {
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

  async function submitAs(
    app: INestApplication,
    employeeId: string,
    managerId: string,
    hours = 8,
  ): Promise<string> {
    await hcmMock.seed({ ...DEFAULT_KEY, employeeId }, 80);
    const res = await request(app.getHttpServer() as Server)
      .post('/requests')
      .send({
        employeeId,
        employerId: DEFAULT_KEY.employerId,
        locationId: DEFAULT_KEY.locationId,
        leaveType: DEFAULT_KEY.leaveType,
        year: DEFAULT_KEY.year,
        startDate: '2024-03-01',
        endDate: '2024-03-05',
        requestedHours: hours,
        submittedById: employeeId,
        managerId,
      })
      .expect(201);
    return (res.body as { externalId: string }).externalId;
  }

  it('returns 400 when neither managerId nor employeeId is provided', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/requests')
      .expect(400);
    expect((res.body as { code: string }).code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when both managerId and employeeId are provided', async () => {
    const res = await request(app.getHttpServer() as Server)
      .get('/requests')
      .query({ managerId: 'mgr-1', employeeId: 'emp-1' })
      .expect(400);
    expect((res.body as { code: string }).code).toBe('VALIDATION_ERROR');
  });

  it('filters by managerId — only returns requests for that manager', async () => {
    await seedHcmConfig(dataSource);
    const idA = await submitAs(app, 'emp-1', 'mgr-1');
    const idB = await submitAs(app, 'emp-2', 'mgr-1');
    const idC = await submitAs(app, 'emp-3', 'mgr-2');

    const res = await request(app.getHttpServer() as Server)
      .get('/requests')
      .query({ managerId: 'mgr-1' })
      .expect(200);

    const body = res.body as {
      items: Array<{ externalId: string }>;
      total: number;
      limit: number;
      offset: number;
    };
    const ids = body.items.map((i) => i.externalId);
    expect(ids).toContain(idA);
    expect(ids).toContain(idB);
    expect(ids).not.toContain(idC);
    expect(body.total).toBe(2);
    expect(body.limit).toBeDefined();
    expect(body.offset).toBeDefined();
  });

  it("filters by employeeId — only returns that employee's requests", async () => {
    await seedHcmConfig(dataSource);
    const idA = await submitAs(app, 'emp-1', 'mgr-1');
    await submitAs(app, 'emp-2', 'mgr-1');

    const res = await request(app.getHttpServer() as Server)
      .get('/requests')
      .query({ employeeId: 'emp-1' })
      .expect(200);

    const body = res.body as {
      items: Array<{ externalId: string }>;
      total: number;
    };
    const ids = body.items.map((i) => i.externalId);
    expect(ids).toContain(idA);
    expect(body.total).toBe(1);
  });

  it('filters by status — only returns matching status', async () => {
    await seedHcmConfig(dataSource);
    const pendingId = await submitAs(app, 'emp-1', 'mgr-1');

    await request(app.getHttpServer() as Server)
      .post(`/requests/${pendingId}/reject`)
      .send({ actorId: 'mgr-1' })
      .expect(200);

    const anotherPendingId = await submitAs(app, 'emp-2', 'mgr-1');

    const res = await request(app.getHttpServer() as Server)
      .get('/requests')
      .query({ managerId: 'mgr-1', status: 'PENDING' })
      .expect(200);

    const body = res.body as { items: Array<{ externalId: string }> };
    const ids = body.items.map((i) => i.externalId);
    expect(ids).toContain(anotherPendingId);
    expect(ids).not.toContain(pendingId);
  });

  it('response shape includes items, total, limit, offset', async () => {
    await seedHcmConfig(dataSource);

    const res = await request(app.getHttpServer() as Server)
      .get('/requests')
      .query({ managerId: 'mgr-99' })
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(typeof body.limit).toBe('number');
    expect(typeof body.offset).toBe('number');
  });

  it('limit and offset paginate results correctly', async () => {
    await seedHcmConfig(dataSource);

    // Seed 3 requests for the same manager, different employees
    await submitAs(app, 'emp-11', 'mgr-5');
    await submitAs(app, 'emp-12', 'mgr-5');
    await submitAs(app, 'emp-13', 'mgr-5');

    const resPage1 = await request(app.getHttpServer() as Server)
      .get('/requests')
      .query({ managerId: 'mgr-5', limit: 2, offset: 0 })
      .expect(200);

    const page1 = resPage1.body as {
      items: Array<{ externalId: string }>;
      total: number;
    };
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);

    const resPage2 = await request(app.getHttpServer() as Server)
      .get('/requests')
      .query({ managerId: 'mgr-5', limit: 2, offset: 2 })
      .expect(200);

    const page2 = resPage2.body as {
      items: Array<{ externalId: string }>;
      total: number;
    };
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(3);
  });

  it('limit exceeding max (100) returns 400', async () => {
    await request(app.getHttpServer() as Server)
      .get('/requests')
      .query({ managerId: 'mgr-1', limit: 101 })
      .expect(400);
  });
});
