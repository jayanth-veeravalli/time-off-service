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

describe('e2e: Submit → Withdraw (PENDING) happy path', () => {
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

  it('submit then withdraw PENDING — 200 WITHDRAWN, no HCM call', async () => {
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

    expect(submitRes.status).toBe(201);
    const { externalId } = submitRes.data as { externalId: string };

    const withdrawRes = await axios.post<{ status: string }>(
      `${e2e.baseUrl}/requests/${externalId}/withdraw`,
      {
        actorId: 'emp-1',
      },
    );

    expect(withdrawRes.status).toBe(200);
    expect(withdrawRes.data.status).toBe('WITHDRAWN');

    const debits = await hcmMock.getDebits();
    expect(Object.keys(debits)).toHaveLength(0);
  });
});
