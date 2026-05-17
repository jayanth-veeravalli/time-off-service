import {
  IsEnum,
  IsInt,
  IsISO8601,
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

@ValidatorConstraint({ name: 'alignedTo15Minutes', async: false })
class AlignedTo15Minutes implements ValidatorConstraintInterface {
  validate(value: string): boolean {
    const match = /T\d{2}:(\d{2}):(\d{2})/.exec(value);
    if (!match) return true; // date-only string — no time to validate
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    return seconds === 0 && minutes % 15 === 0;
  }

  defaultMessage(): string {
    return 'time must be on a 15-minute boundary (e.g. 09:00:00, 09:15:00, 09:30:00, or 09:45:00)';
  }
}

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

  @IsISO8601()
  @Validate(AlignedTo15Minutes)
  startDate: string;

  @IsISO8601()
  @Validate(AlignedTo15Minutes)
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
