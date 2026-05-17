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

interface SubmitResponse {
  status: string;
  externalId: string;
}

interface Transition {
  toState: string;
  fromState: string;
}

interface GetRequestResponse {
  status: string;
  transitions: Transition[];
}

interface Comment {
  body: string;
  authorType: string;
}

describe('e2e: Submit → Reject happy path', () => {
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

  it('submit, reject with comment — REJECTED status, comment accessible via GET comments', async () => {
    await seedHcmConfig(dataSource);
    await hcmMock.seed(DEFAULT_KEY, 80);

    const submitRes = await axios.post<SubmitResponse>(
      `${e2e.baseUrl}/requests`,
      {
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
      },
    );

    expect(submitRes.status).toBe(201);
    const { externalId } = submitRes.data;

    const rejectRes = await axios.post<{ status: string }>(
      `${e2e.baseUrl}/requests/${externalId}/reject`,
      {
        actorId: 'mgr-1',
        comment: 'Budget frozen for Q1',
      },
    );

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.data.status).toBe('REJECTED');

    // GET shows REJECTED status and transitions
    const getRes = await axios.get<GetRequestResponse>(
      `${e2e.baseUrl}/requests/${externalId}`,
    );
    expect(getRes.data.status).toBe('REJECTED');
    const rejectT = getRes.data.transitions.find(
      (t) => t.toState === 'REJECTED',
    );
    expect(rejectT?.fromState).toBe('PENDING');

    // comment is accessible
    const commentsRes = await axios.get<Comment[]>(
      `${e2e.baseUrl}/requests/${externalId}/comments`,
    );
    expect(commentsRes.data).toHaveLength(1);
    expect(commentsRes.data[0].body).toBe('Budget frozen for Q1');
  });
});
