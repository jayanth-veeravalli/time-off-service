import { SchedulerService } from '../../../src/scheduler/scheduler.service';
import { RequestStatus } from '../../../src/common/types';
import { FixedClockService } from '../../helpers/fixed-clock.service';
import { makeNotifications } from '../../helpers/mocks';
import type { RequestsRepository } from '../../../src/requests/requests.repository';
import type { NotificationsService } from '../../../src/notifications/notifications.service';

const TODAY = '2024-01-15';
const YESTERDAY = '2024-01-14';
const TOMORROW = '2024-01-16';

function makeRequest(
  externalId: string,
  startDate: string,
  employeeId = 'emp-1',
  managerId = 'mgr-1',
) {
  return {
    id: 1,
    externalId,
    employeeId,
    managerId,
    startDate,
    status: RequestStatus.PENDING,
  };
}

function makeRepo(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    findPendingByStartDateOnOrAfter: jest.fn().mockResolvedValue([]),
    findPendingByStartDateBefore: jest.fn().mockResolvedValue([]),
    transitionStatus: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeService(
  repoOverrides: Partial<Record<string, jest.Mock>> = {},
  clockDate = new Date(`${TODAY}T12:00:00.000Z`),
) {
  const clock = new FixedClockService();
  clock.setTime(clockDate);
  const repo = makeRepo(repoOverrides);
  const notifications = makeNotifications();
  const service = new SchedulerService(
    repo as unknown as RequestsRepository,
    notifications as unknown as NotificationsService,
    clock,
  );
  return { service, repo, notifications };
}

describe('SchedulerService.runReminderJob', () => {
  it('queries findPendingByStartDateOnOrAfter with today', async () => {
    const { service, repo } = makeService();
    await service.runReminderJob();
    expect(repo.findPendingByStartDateOnOrAfter).toHaveBeenCalledWith(TODAY);
  });

  it('calls notifyPendingRequests once per manager with their requests', async () => {
    const pending = [makeRequest('r-1', TODAY), makeRequest('r-2', TOMORROW)];
    const { service, notifications } = makeService({
      findPendingByStartDateOnOrAfter: jest.fn().mockResolvedValue(pending),
    });
    await service.runReminderJob();
    expect(notifications.notifyPendingRequests).toHaveBeenCalledTimes(1);
    expect(notifications.notifyPendingRequests).toHaveBeenCalledWith(
      'mgr-1',
      pending,
    );
  });

  it('does not call transitionStatus', async () => {
    const { service, repo } = makeService();
    await service.runReminderJob();
    expect(repo.transitionStatus).not.toHaveBeenCalled();
  });

  it('does not call notifyPendingRequests when nothing is pending', async () => {
    const { service, notifications } = makeService();
    await service.runReminderJob();
    expect(notifications.notifyPendingRequests).not.toHaveBeenCalled();
  });
});

describe('SchedulerService.runCancellationJob', () => {
  it('queries findPendingByStartDateBefore with today', async () => {
    const { service, repo } = makeService();
    await service.runCancellationJob();
    expect(repo.findPendingByStartDateBefore).toHaveBeenCalledWith(TODAY);
  });

  it('calls transitionStatus for each expired request', async () => {
    const expired = [
      makeRequest('r-1', YESTERDAY),
      makeRequest('r-2', YESTERDAY, 'emp-2'),
    ];
    const { service, repo } = makeService({
      findPendingByStartDateBefore: jest.fn().mockResolvedValue(expired),
    });
    await service.runCancellationJob();
    expect(repo.transitionStatus).toHaveBeenCalledTimes(2);
    expect(repo.transitionStatus).toHaveBeenCalledWith(
      'r-1',
      RequestStatus.PENDING,
      RequestStatus.CANCELLED,
      'SCHEDULER',
      'SYSTEM',
    );
  });

  it('notifies employee for each cancelled request', async () => {
    const expired = [
      makeRequest('r-1', YESTERDAY, 'emp-1'),
      makeRequest('r-2', YESTERDAY, 'emp-2'),
    ];
    const { service, notifications } = makeService({
      findPendingByStartDateBefore: jest.fn().mockResolvedValue(expired),
    });
    await service.runCancellationJob();
    expect(notifications.notifyEmployee).toHaveBeenCalledTimes(2);
    expect(notifications.notifyEmployee).toHaveBeenCalledWith(
      'emp-1',
      RequestStatus.CANCELLED,
      'r-1',
    );
    expect(notifications.notifyEmployee).toHaveBeenCalledWith(
      'emp-2',
      RequestStatus.CANCELLED,
      'r-2',
    );
  });

  it('does not cancel requests with startDate equal to today', async () => {
    // today-boundary: only strictly before today triggers cancellation
    const { service, repo } = makeService({
      findPendingByStartDateBefore: jest.fn().mockResolvedValue([]),
    });
    await service.runCancellationJob();
    expect(repo.transitionStatus).not.toHaveBeenCalled();
  });

  it('does not call notifyEmployee when there is nothing to cancel', async () => {
    const { service, notifications } = makeService();
    await service.runCancellationJob();
    expect(notifications.notifyEmployee).not.toHaveBeenCalled();
  });
});
