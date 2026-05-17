import { Injectable } from '@nestjs/common';
import { LeaveType } from '../common/types';
import { HcmAdapterFactory } from '../hcm/hcm-adapter.factory';

export interface BalanceResponse {
  employeeId: string;
  employerId: string;
  locationId: string;
  leaveType: LeaveType;
  year: number;
  balanceHours: number;
}

@Injectable()
export class BalanceService {
  constructor(private readonly hcmFactory: HcmAdapterFactory) {}

  async getBalance(
    employeeId: string,
    employerId: string,
    locationId: string,
    leaveType: LeaveType,
    year: number,
  ): Promise<BalanceResponse> {
    const adapter = await this.hcmFactory.getAdapter(employerId);
    const balanceHours = await adapter.getBalance({
      employerId,
      employeeId,
      locationId,
      leaveType,
      year,
    });
    return { employeeId, employerId, locationId, leaveType, year, balanceHours };
  }
}
