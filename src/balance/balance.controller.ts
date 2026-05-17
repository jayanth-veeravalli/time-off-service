import { Controller, Get, Param, Query, ParseIntPipe } from '@nestjs/common';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { LeaveType } from '../common/types';
import { BalanceService } from './balance.service';

class GetBalanceQuery {
  @IsString()
  @IsNotEmpty()
  employerId: string;

  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsEnum(LeaveType)
  leaveType: LeaveType;
}

@Controller()
export class BalanceController {
  constructor(private readonly service: BalanceService) {}

  @Get('employees/:employeeId/balance')
  getBalance(
    @Param('employeeId') employeeId: string,
    @Query('employerId') employerId: string,
    @Query('locationId') locationId: string,
    @Query('leaveType') leaveType: LeaveType,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.service.getBalance(employeeId, employerId, locationId, leaveType, year);
  }
}
