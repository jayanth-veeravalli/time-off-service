import axios from 'axios';
import { DataSource } from 'typeorm';
import {
  buildE2EApp,
  deterministicUuid,
  hcmMock,
  resetDb,
  seedHcmConfig,
  startMockServer,
  stopMockServer,
  DEFAULT_KEY,
  E2EApp,
} from '../setup';

describe('e2e: balance and comments endpoints', () => {
  let e2e: E2EApp;
  let dataSource: DataSource;

  beforeAll(async () => {
    await startMockServer();
    e2e = await buildE2EApp();
    dataSource = e2e.dataSource;
  });

  afterAll(async () => {
    await e2e.app.close();
    await stopMockServer();
  });

  beforeEach(async () => {
    await resetDb(dataSource);
    await hcmMock.reset();
    deterministicUuid.reset();
  });

  it('GET balance returns correct balanceHours from HCM', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 120);

    const res = await axios.get<{ balanceHours: number }>(
      `${e2e.baseUrl}/employees/${DEFAULT_KEY.employeeId}/balance`,
      {
        params: {
          employerId: DEFAULT_KEY.employerId,
          locationId: DEFAULT_KEY.locationId,
          leaveType: DEFAULT_KEY.leaveType,
          year: String(DEFAULT_KEY.year),
        },
      },
    );

    expect(res.status).toBe(200);
    expect(res.data.balanceHours).toBe(120);
  });

  it('POST and GET comments round-trip', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const submitRes = await axios.post(`${e2e.baseUrl}/requests`, {
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
    });

    const { externalId } = submitRes.data as { externalId: string };

    await axios.post(`${e2e.baseUrl}/requests/${externalId}/comments`, {
      authorId: 'emp-1',
      authorType: 'EMPLOYEE',
      body: 'Please expedite review',
    });

    const commentsRes = await axios.get<
      Array<{ body: string; authorType: string }>
    >(`${e2e.baseUrl}/requests/${externalId}/comments`);
    expect(commentsRes.data).toHaveLength(1);
    expect(commentsRes.data[0].body).toBe('Please expedite review');
    expect(commentsRes.data[0].authorType).toBe('EMPLOYEE');
  });

  it('two comments on the same request — GET retrieves both in order', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const submitRes = await axios.post(`${e2e.baseUrl}/requests`, {
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
    });
    const { externalId } = submitRes.data as { externalId: string };

    await axios.post(`${e2e.baseUrl}/requests/${externalId}/comments`, {
      authorId: 'emp-1',
      authorType: 'EMPLOYEE',
      body: 'First comment',
    });
    await axios.post(`${e2e.baseUrl}/requests/${externalId}/comments`, {
      authorId: 'mgr-1',
      authorType: 'MANAGER',
      body: 'Second comment',
    });

    const commentsRes = await axios.get<
      Array<{ body: string; authorId: string; authorType: string }>
    >(`${e2e.baseUrl}/requests/${externalId}/comments`);

    expect(commentsRes.status).toBe(200);
    expect(commentsRes.data).toHaveLength(2);
    expect(commentsRes.data[0].body).toBe('First comment');
    expect(commentsRes.data[0].authorId).toBe('emp-1');
    expect(commentsRes.data[0].authorType).toBe('EMPLOYEE');
    expect(commentsRes.data[1].body).toBe('Second comment');
    expect(commentsRes.data[1].authorId).toBe('mgr-1');
    expect(commentsRes.data[1].authorType).toBe('MANAGER');
  });

  it('comments are scoped to their request — two requests have independent comment lists', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 160);

    const [res1, res2] = await Promise.all([
      axios.post(`${e2e.baseUrl}/requests`, {
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
      }),
      axios.post(`${e2e.baseUrl}/requests`, {
        employeeId: DEFAULT_KEY.employeeId,
        employerId: DEFAULT_KEY.employerId,
        locationId: DEFAULT_KEY.locationId,
        leaveType: DEFAULT_KEY.leaveType,
        year: DEFAULT_KEY.year,
        startDate: '2024-04-01',
        endDate: '2024-04-05',
        requestedHours: 40,
        submittedById: 'emp-1',
        managerId: 'mgr-1',
      }),
    ]);

    const id1 = (res1.data as { externalId: string }).externalId;
    const id2 = (res2.data as { externalId: string }).externalId;

    await axios.post(`${e2e.baseUrl}/requests/${id1}/comments`, {
      authorId: 'emp-1',
      authorType: 'EMPLOYEE',
      body: 'Comment on request 1',
    });
    await axios.post(`${e2e.baseUrl}/requests/${id2}/comments`, {
      authorId: 'mgr-1',
      authorType: 'MANAGER',
      body: 'Comment on request 2',
    });

    const [c1, c2] = await Promise.all([
      axios.get<Array<{ body: string }>>(
        `${e2e.baseUrl}/requests/${id1}/comments`,
      ),
      axios.get<Array<{ body: string }>>(
        `${e2e.baseUrl}/requests/${id2}/comments`,
      ),
    ]);

    expect(c1.data).toHaveLength(1);
    expect(c1.data[0].body).toBe('Comment on request 1');
    expect(c2.data).toHaveLength(1);
    expect(c2.data[0].body).toBe('Comment on request 2');
  });

  it('GET comments on unknown request returns 404', async () => {
    await expect(
      axios.get(`${e2e.baseUrl}/requests/does-not-exist/comments`),
    ).rejects.toMatchObject({ response: { status: 404 } });
  });

  it('POST comment with invalid authorType returns 400', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const submitRes = await axios.post(`${e2e.baseUrl}/requests`, {
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
    });
    const { externalId } = submitRes.data as { externalId: string };

    await expect(
      axios.post(`${e2e.baseUrl}/requests/${externalId}/comments`, {
        authorId: 'emp-1',
        authorType: 'ROBOT',
        body: 'Invalid author type',
      }),
    ).rejects.toMatchObject({ response: { status: 400 } });
  });
});
