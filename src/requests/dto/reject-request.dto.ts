import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RejectRequestDto {
  @IsString()
  @IsNotEmpty()
  actorId: string;

  @IsString()
  @IsOptional()
  comment?: string;
}
