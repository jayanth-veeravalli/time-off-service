import { LeaveType, AuthorType, HcmType, RequestStatus } from '../../src/common/types';

export function makeSubmitRequestDto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    employeeId: 'emp-1',
    employerId: 'er-1',
    locationId: 'loc-1',
    leaveType: LeaveType.VACATION,
    year: 2024,
    startDate: '2024-03-01',
    endDate: '2024-03-05',
    requestedHours: 40,
    submittedById: 'emp-1',
    ...overrides,
  };
}

export function makeRequest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    externalId: '00000000-0000-0000-0000-000000000001',
    employeeId: 'emp-1',
    employerId: 'er-1',
    locationId: 'loc-1',
    leaveType: LeaveType.VACATION,
    year: 2024,
    startDate: '2024-03-01',
    endDate: '2024-03-05',
    requestedHours: 40,
    status: RequestStatus.PENDING,
    submittedById: 'emp-1',
    managerId: 'mgr-1',
    createdAt: new Date('2024-01-15T12:00:00.000Z'),
    updatedAt: new Date('2024-01-15T12:00:00.000Z'),
    ...overrides,
  };
}

export function makeSubmitBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    employeeId: 'emp-1',
    employerId: 'er-1',
    locationId: 'loc-1',
    leaveType: 'VACATION',
    year: 2024,
    startDate: '2024-03-01',
    endDate: '2024-03-05',
    requestedHours: 40,
    submittedById: 'emp-1',
    managerId: 'mgr-1',
    ...overrides,
  };
}

export function makeHcmConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    employerId: 'er-1',
    hcmType: HcmType.WORKDAY,
    baseUrl: 'http://localhost:9999',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

export function makeComment(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    requestId: 1,
    authorId: 'emp-1',
    authorType: AuthorType.EMPLOYEE,
    body: 'Test comment',
    createdAt: new Date('2024-01-15T12:00:00.000Z'),
    ...overrides,
  };
}
