import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClockService } from '../common/clock.service';
import { ActorType, RequestStatus } from '../common/types';
import { NotificationsService } from '../notifications/notifications.service';
import { RequestsRepository } from '../requests/requests.repository';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly repo: RequestsRepository,
    private readonly notifications: NotificationsService,
    private readonly clock: ClockService,
  ) {}

  @Cron('0 8 * * *')
  async runReminderJob(): Promise<void> {
    const today = this.toDateString(this.clock.now());
    this.logger.log(`[reminder] starting — today=${today}`);

    const pending = await this.repo.findPendingByStartDateOnOrAfter(today);
    this.logger.log(`[reminder] found ${pending.length} pending request(s) to remind`);

    const byManager = new Map<string, typeof pending>();
    for (const req of pending) {
      const group = byManager.get(req.managerId) ?? [];
      group.push(req);
      byManager.set(req.managerId, group);
    }
    for (const [managerId, requests] of byManager) {
      this.notifications.notifyPendingRequests(managerId, requests);
    }
    this.logger.log('[reminder] done');
  }

  @Cron('59 23 * * *')
  async runCancellationJob(): Promise<void> {
    const today = this.toDateString(this.clock.now());
    this.logger.log(`[cancellation] starting — today=${today}`);

    const expired = await this.repo.findPendingByStartDateBefore(today);
    this.logger.log(`[cancellation] found ${expired.length} expired request(s)`);

    for (const request of expired) {
      await this.repo.transitionStatus(
        request.externalId,
        RequestStatus.PENDING,
        RequestStatus.CANCELLED,
        'SCHEDULER',
        ActorType.SYSTEM,
      );
      this.notifications.notifyEmployee(request.employeeId, RequestStatus.CANCELLED, request.externalId);
    }

    this.logger.log(`[cancellation] cancelled ${expired.length} request(s)`);
  }

  private toDateString(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
