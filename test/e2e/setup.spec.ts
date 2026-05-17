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

describe('e2e setup smoke test', () => {
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

  it('app is reachable and responds to a known endpoint', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const res = await axios.post(`${e2e.baseUrl}/requests`, {
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

    expect(res.status).toBe(201);
    expect(res.data.status).toBe('PENDING');
    expect(res.data.externalId).toBeDefined();
  });

  it('DataSource is initialized', () => {
    expect(dataSource.isInitialized).toBe(true);
  });
});
