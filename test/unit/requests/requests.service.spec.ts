import {
  HcmConfigNotFoundException,
  HcmUnavailableException,
  InsufficientBalanceException,
  InvalidTransitionException,
  OverlapConflictException,
  RequestNotFoundException,
} from '../../../src/common/exceptions';
import { LeaveType, RequestStatus } from '../../../src/common/types';
import { RequestsService } from '../../../src/requests/requests.service';
import type { RequestsRepository } from '../../../src/requests/requests.repository';
import type { LockService } from '../../../src/requests/lock.service';
import type { HcmAdapterFactory } from '../../../src/hcm/hcm-adapter.factory';
import type { NotificationsService } from '../../../src/notifications/notifications.service';
import type { CommentsService } from '../../../src/comments/comments.service';
import { FixedClockService } from '../../helpers/fixed-clock.service';
import { DeterministicUuidService } from '../../helpers/deterministic-uuid.service';
import {
  makeRepo,
  makeAdapter,
  makeHcmFactory,
  makeNotifications,
  makeLock,
} from '../../helpers/mocks';

// ─── shared factories ───────────────────────────────────────────────────────

function makeCommentsService() {
  return { addComment: jest.fn().mockResolvedValue({}) };
}

function buildService(
  repoOverrides: Partial<Record<string, jest.Mock>> = {},
  balance = 100,
) {
  const repo = makeRepo({
    findTransitionsByRequestId: jest.fn().mockResolvedValue([]),
    ...repoOverrides,
  });
  const adapter = makeAdapter(balance);
  const factory = makeHcmFactory(adapter);
  const notifications = makeNotifications();
  const commentsService = makeCommentsService();
  const lock = makeLock();
  const service = new RequestsService(
    repo as unknown as RequestsRepository,
    lock as unknown as LockService,
    factory as unknown as HcmAdapterFactory,
    notifications as unknown as NotificationsService,
    commentsService as unknown as CommentsService,
    new FixedClockService(),
    new DeterministicUuidService(),
  );
  return {
    service,
    repo,
    adapter,
    factory,
    notifications,
    commentsService,
    lock,
  };
}

function makeRequest(status: RequestStatus, overrides: object = {}) {
  return {
    id: 1,
    externalId: 'req-ext-1',
    employeeId: 'emp-1',
    employerId: 'er-1',
    locationId: 'loc-1',
    leaveType: LeaveType.VACATION,
    year: 2024,
    requestedHours: 40,
    managerId: 'mgr-1',
    status,
    ...overrides,
  };
}

function buildServiceWithRequest(status: RequestStatus) {
  const stored = makeRequest(status);
  const { service, adapter, notifications } = buildService({
    findByExternalId: jest
      .fn()
      .mockImplementation(() => Promise.resolve({ ...stored })),
    transitionStatus: jest
      .fn()
      .mockImplementation(
        (_id: string, _from: unknown, toStatus: RequestStatus) => {
          stored.status = toStatus;
          return Promise.resolve(true);
        },
      ),
  });
  return { service, adapter, notifications, stored };
}

const BASE_DTO = {
  employeeId: 'emp-1',
  employerId: 'er-1',
  locationId: 'loc-1',
  leaveType: LeaveType.VACATION,
  year: 2024,
  startDate: '2024-03-01',
  endDate: '2024-03-05',
  submittedById: 'emp-1',
  managerId: 'mgr-1',
};

// ─── submit — balance guard ──────────────────────────────────────────────────

describe('RequestsService — submit: balance guard', () => {
  it('passes when requestedHours + pendingHours equals balance exactly', async () => {
    const { service } = buildService(
      { sumPendingHours: jest.fn().mockResolvedValue(0) },
      40,
    );
    await expect(
      service.submit({ ...BASE_DTO, requestedHours: 40 }),
    ).resolves.toBeDefined();
  });

  it('throws InsufficientBalance when requestedHours + pendingHours exceeds balance by 1', async () => {
    const { service } = buildService(
      { sumPendingHours: jest.fn().mockResolvedValue(0) },
      40,
    );
    await expect(
      service.submit({ ...BASE_DTO, requestedHours: 41 }),
    ).rejects.toBeInstanceOf(InsufficientBalanceException);
  });

  it('throws InsufficientBalance when existing pending hours fill the balance', async () => {
    const { service } = buildService(
      { sumPendingHours: jest.fn().mockResolvedValue(40) },
      40,
    );
    await expect(
      service.submit({ ...BASE_DTO, requestedHours: 8 }),
    ).rejects.toBeInstanceOf(InsufficientBalanceException);
  });

  it('passes when balance and requested hours are both 0 (DTO rejects 0, guard stays consistent)', async () => {
    const { service } = buildService(
      { sumPendingHours: jest.fn().mockResolvedValue(0) },
      0,
    );
    await expect(
      service.submit({ ...BASE_DTO, requestedHours: 0 }),
    ).resolves.toBeDefined();
  });

  it('throws OverlapConflict before checking balance when dates overlap', async () => {
    const { service } = buildService({
      findOverlapping: jest.fn().mockResolvedValue([{ id: 1 }]),
    });
    await expect(
      service.submit({ ...BASE_DTO, requestedHours: 8 }),
    ).rejects.toBeInstanceOf(OverlapConflictException);
  });

  it('propagates HcmUnavailableException from getBalance', async () => {
    const repo = makeRepo();
    const adapter = {
      ...makeAdapter(100),
      getBalance: jest.fn().mockRejectedValue(new HcmUnavailableException()),
    };
    const service = new RequestsService(
      repo as unknown as RequestsRepository,
      makeLock() as unknown as LockService,
      makeHcmFactory(adapter) as unknown as HcmAdapterFactory,
      makeNotifications() as unknown as NotificationsService,
      makeCommentsService() as unknown as CommentsService,
      new FixedClockService(),
      new DeterministicUuidService(),
    );
    await expect(
      service.submit({ ...BASE_DTO, requestedHours: 8 }),
    ).rejects.toBeInstanceOf(HcmUnavailableException);
  });

  it('propagates HcmConfigNotFoundException from factory', async () => {
    const service = new RequestsService(
      makeRepo() as unknown as RequestsRepository,
      makeLock() as unknown as LockService,
      {
        getAdapter: jest
          .fn()
          .mockRejectedValue(new HcmConfigNotFoundException('er-1')),
      } as unknown as HcmAdapterFactory,
      makeNotifications() as unknown as NotificationsService,
      makeCommentsService() as unknown as CommentsService,
      new FixedClockService(),
      new DeterministicUuidService(),
    );
    await expect(
      service.submit({ ...BASE_DTO, requestedHours: 8 }),
    ).rejects.toBeInstanceOf(HcmConfigNotFoundException);
  });
});

// ─── approve — balance guard ─────────────────────────────────────────────────

describe('RequestsService — approve: balance guard', () => {
  it('throws InsufficientBalance when other pending hours consume the full balance', async () => {
    const request = makeRequest(RequestStatus.PENDING);
    const { service, adapter } = buildService(
      {
        findByExternalId: jest.fn().mockResolvedValue(request),
        sumPendingHours: jest.fn().mockResolvedValue(40),
      },
      40,
    );
    await expect(service.approve('req-ext-1', 'mgr-1')).rejects.toBeInstanceOf(
      InsufficientBalanceException,
    );
    expect(adapter.debitBalance).not.toHaveBeenCalled();
  });
});

// ─── state machine — approve ─────────────────────────────────────────────────

describe('RequestsService — approve: state machine', () => {
  it('PENDING → APPROVED succeeds', async () => {
    const { service } = buildServiceWithRequest(RequestStatus.PENDING);
    await expect(service.approve('req-ext-1', 'mgr-1')).resolves.toBeDefined();
  });

  it('APPROVED → APPROVED returns idempotently without calling debitBalance', async () => {
    const { service, adapter } = buildServiceWithRequest(
      RequestStatus.APPROVED,
    );
    await expect(service.approve('req-ext-1', 'mgr-1')).resolves.toBeDefined();
    expect(adapter.debitBalance).not.toHaveBeenCalled();
  });

  it('REJECTED → APPROVED throws InvalidTransitionException', async () => {
    const { service } = buildServiceWithRequest(RequestStatus.REJECTED);
    await expect(service.approve('req-ext-1', 'mgr-1')).rejects.toBeInstanceOf(
      InvalidTransitionException,
    );
  });

  it('CANCELLED → APPROVED throws InvalidTransitionException', async () => {
    const { service } = buildServiceWithRequest(RequestStatus.CANCELLED);
    await expect(service.approve('req-ext-1', 'mgr-1')).rejects.toBeInstanceOf(
      InvalidTransitionException,
    );
  });

  it('WITHDRAWN → APPROVED throws InvalidTransitionException', async () => {
    const { service } = buildServiceWithRequest(RequestStatus.WITHDRAWN);
    await expect(service.approve('req-ext-1', 'mgr-1')).rejects.toBeInstanceOf(
      InvalidTransitionException,
    );
  });

  it('throws RequestNotFoundException when request does not exist', async () => {
    const { service } = buildService({
      findByExternalId: jest.fn().mockResolvedValue(null),
    });
    await expect(service.approve('missing', 'mgr-1')).rejects.toBeInstanceOf(
      RequestNotFoundException,
    );
  });
});

// ─── state machine — reject ──────────────────────────────────────────────────

describe('RequestsService — reject: state machine', () => {
  it('PENDING → REJECTED succeeds', async () => {
    const { service } = buildServiceWithRequest(RequestStatus.PENDING);
    await expect(service.reject('req-ext-1', 'mgr-1')).resolves.toBeDefined();
  });

  it('REJECTED → REJECTED returns idempotently', async () => {
    const { service } = buildServiceWithRequest(RequestStatus.REJECTED);
    await expect(service.reject('req-ext-1', 'mgr-1')).resolves.toBeDefined();
  });

  it('APPROVED → REJECTED throws InvalidTransitionException', async () => {
    const { service } = buildServiceWithRequest(RequestStatus.APPROVED);
    await expect(service.reject('req-ext-1', 'mgr-1')).rejects.toBeInstanceOf(
      InvalidTransitionException,
    );
  });
});

// ─── state machine — withdraw ────────────────────────────────────────────────

describe('RequestsService — withdraw: state machine', () => {
  it('PENDING → WITHDRAWN succeeds without HCM call', async () => {
    const { service, adapter } = buildServiceWithRequest(RequestStatus.PENDING);
    await expect(service.withdraw('req-ext-1', 'emp-1')).resolves.toBeDefined();
    expect(adapter.reverseDebit).not.toHaveBeenCalled();
  });

  it('APPROVED → WITHDRAWN calls reverseDebit', async () => {
    const { service, adapter } = buildServiceWithRequest(
      RequestStatus.APPROVED,
    );
    await expect(service.withdraw('req-ext-1', 'emp-1')).resolves.toBeDefined();
    expect(adapter.reverseDebit).toHaveBeenCalledTimes(1);
  });

  it('WITHDRAWN → WITHDRAWN returns idempotently', async () => {
    const { service } = buildServiceWithRequest(RequestStatus.WITHDRAWN);
    await expect(service.withdraw('req-ext-1', 'emp-1')).resolves.toBeDefined();
  });

  it('REJECTED → WITHDRAWN throws InvalidTransitionException', async () => {
    const { service } = buildServiceWithRequest(RequestStatus.REJECTED);
    await expect(service.withdraw('req-ext-1', 'emp-1')).rejects.toBeInstanceOf(
      InvalidTransitionException,
    );
  });

  it('CANCELLED → WITHDRAWN throws InvalidTransitionException', async () => {
    const { service } = buildServiceWithRequest(RequestStatus.CANCELLED);
    await expect(service.withdraw('req-ext-1', 'emp-1')).rejects.toBeInstanceOf(
      InvalidTransitionException,
    );
  });
});

// ─── notifications ───────────────────────────────────────────────────────────

describe('RequestsService — notifications', () => {
  it('notifies employee on APPROVED transition', async () => {
    const { service, notifications } = buildServiceWithRequest(
      RequestStatus.PENDING,
    );
    await service.approve('req-ext-1', 'mgr-1');
    expect(notifications.notifyEmployee).toHaveBeenCalledWith(
      'emp-1',
      RequestStatus.APPROVED,
      'req-ext-1',
    );
  });

  it('notifies employee on REJECTED transition', async () => {
    const { service, notifications } = buildServiceWithRequest(
      RequestStatus.PENDING,
    );
    await service.reject('req-ext-1', 'mgr-1');
    expect(notifications.notifyEmployee).toHaveBeenCalledWith(
      'emp-1',
      RequestStatus.REJECTED,
      'req-ext-1',
    );
  });

  it('notifies employee on WITHDRAWN from PENDING', async () => {
    const { service, notifications } = buildServiceWithRequest(
      RequestStatus.PENDING,
    );
    await service.withdraw('req-ext-1', 'emp-1');
    expect(notifications.notifyEmployee).toHaveBeenCalledWith(
      'emp-1',
      RequestStatus.WITHDRAWN,
      'req-ext-1',
    );
  });
});
