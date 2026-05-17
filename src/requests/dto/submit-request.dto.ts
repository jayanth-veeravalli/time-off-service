import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { LeaveType } from '../../common/types';

@ValidatorConstraint({ name: 'endDateAfterStartDate', async: false })
class EndDateAfterStartDate implements ValidatorConstraintInterface {
  validate(endDate: string, args: ValidationArguments): boolean {
    const dto = args.object as SubmitRequestDto;
    return endDate >= dto.startDate;
  }

  defaultMessage(): string {
    return 'endDate must be on or after startDate';
  }
}

export class SubmitRequestDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsString()
  @IsNotEmpty()
  employerId: string;

  @IsString()
  @IsNotEmpty()
  locationId: string;

  @IsEnum(LeaveType)
  leaveType: LeaveType;

  @IsInt()
  @IsPositive()
  year: number;

  @IsString()
  @IsNotEmpty()
  startDate: string;

  @IsString()
  @IsNotEmpty()
  @Validate(EndDateAfterStartDate)
  endDate: string;

  @IsInt()
  @Min(1)
  requestedHours: number;

  @IsString()
  @IsNotEmpty()
  submittedById: string;

  @IsString()
  @IsNotEmpty()
  managerId: string;
}
