import { IsNotEmpty, IsString } from 'class-validator';

export class ReassignManagerDto {
  @IsString()
  @IsNotEmpty()
  managerId: string;
}
