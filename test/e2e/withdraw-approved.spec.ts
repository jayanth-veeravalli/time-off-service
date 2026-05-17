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

describe('e2e: Approve → Withdraw (APPROVED with HCM reversal)', () => {
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

  it('submit → approve → withdraw — WITHDRAWN, reverseDebit called with correct externalId', async () => {
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

    await axios.post(`${e2e.baseUrl}/requests/${externalId}/approve`, {
      actorId: 'mgr-1',
    });

    // debit recorded after approve
    const debitsAfterApprove = await hcmMock.getDebits();
    expect(debitsAfterApprove[externalId]).toBe(40);

    const withdrawRes = await axios.post<{ status: string }>(
      `${e2e.baseUrl}/requests/${externalId}/withdraw`,
      {
        actorId: 'emp-1',
      },
    );

    expect(withdrawRes.status).toBe(200);
    expect(withdrawRes.data.status).toBe('WITHDRAWN');

    // reversal cleared the debit entry
    const debitsAfterWithdraw = await hcmMock.getDebits();
    expect(debitsAfterWithdraw[externalId]).toBeUndefined();
  });
});
