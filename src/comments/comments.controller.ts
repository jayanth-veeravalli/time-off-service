import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { AddCommentDto } from './dto/add-comment.dto';

@Controller()
export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  @Post('requests/:externalId/comments')
  @HttpCode(HttpStatus.CREATED)
  addComment(
    @Param('externalId') externalId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true })) dto: AddCommentDto,
  ) {
    return this.service.addComment(externalId, dto);
  }

  @Get('requests/:externalId/comments')
  getComments(@Param('externalId') externalId: string) {
    return this.service.getComments(externalId);
  }
}
