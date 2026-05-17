import { Injectable, Logger } from '@nestjs/common';
import { TimeOffRequestEntity } from '../requests/time-off-request.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  notifyEmployee(
    employeeId: string,
    status: string,
    requestExternalId: string,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'employee_notification',
        employeeId,
        status,
        requestExternalId,
      }),
    );
  }

  notifyPendingRequests(
    managerId: string,
    pendingRequests: TimeOffRequestEntity[],
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'manager_reminder',
        managerId,
        pendingCount: pendingRequests.length,
        requestIds: pendingRequests.map((r) => r.externalId),
      }),
    );
  }
}
