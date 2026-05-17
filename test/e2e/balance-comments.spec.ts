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
} from './setup';

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

    const res = await axios.get(`${e2e.baseUrl}/employees/${DEFAULT_KEY.employeeId}/balance`, {
      params: {
        employerId: DEFAULT_KEY.employerId,
        locationId: DEFAULT_KEY.locationId,
        leaveType: DEFAULT_KEY.leaveType,
        year: String(DEFAULT_KEY.year),
      },
    });

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

    const commentsRes = await axios.get(`${e2e.baseUrl}/requests/${externalId}/comments`);
    expect(commentsRes.data).toHaveLength(1);
    expect(commentsRes.data[0].body).toBe('Please expedite review');
    expect(commentsRes.data[0].authorType).toBe('EMPLOYEE');
  });
});
