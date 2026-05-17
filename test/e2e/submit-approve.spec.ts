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

describe('e2e: Submit → Approve happy path', () => {
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

  it('submit returns 201 PENDING, approve returns 200 APPROVED, debitBalance called once', async () => {
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
    expect(submitRes.data.status).toBe('PENDING');

    const { externalId } = submitRes.data as { externalId: string };

    const approveRes = await axios.post(`${e2e.baseUrl}/requests/${externalId}/approve`, {
      actorId: 'mgr-1',
    });

    expect(approveRes.status).toBe(200);
    expect(approveRes.data.status).toBe('APPROVED');

    // transitions in GET response
    const getRes = await axios.get(`${e2e.baseUrl}/requests/${externalId}`);
    expect(getRes.data.transitions).toHaveLength(2);
    const approveT = getRes.data.transitions.find(
      (t: { toState: string }) => t.toState === 'APPROVED',
    );
    expect(approveT.fromState).toBe('PENDING');

    // HCM debit fired once with correct externalId
    const debits = await hcmMock.getDebits();
    expect(debits[externalId]).toBe(40);
  });
});
