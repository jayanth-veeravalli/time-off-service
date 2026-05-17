import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { AuthorType } from '../../common/types';

export class AddCommentDto {
  @IsString()
  @IsNotEmpty()
  authorId: string;

  @IsEnum(AuthorType)
  authorType: AuthorType;

  @IsString()
  @IsNotEmpty()
  body: string;
}
