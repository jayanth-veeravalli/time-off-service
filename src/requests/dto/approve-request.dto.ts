import { IsNotEmpty, IsString } from 'class-validator';

export class ApproveRequestDto {
  @IsString()
  @IsNotEmpty()
  actorId: string;
}
