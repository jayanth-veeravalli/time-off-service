import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClockService } from '../common/clock.service';
import { RequestNotFoundException } from '../common/exceptions';
import { TimeOffRequestEntity } from '../requests/time-off-request.entity';
import { RequestCommentEntity } from './request-comment.entity';
import { AddCommentDto } from './dto/add-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(RequestCommentEntity)
    private readonly commentRepo: Repository<RequestCommentEntity>,
    @InjectRepository(TimeOffRequestEntity)
    private readonly requestRepo: Repository<TimeOffRequestEntity>,
    private readonly clock: ClockService,
  ) {}

  async addComment(
    externalId: string,
    dto: AddCommentDto,
  ): Promise<RequestCommentEntity> {
    const request = await this.requestRepo.findOne({ where: { externalId } });
    if (!request) throw new RequestNotFoundException(externalId);

    const comment = this.commentRepo.create({
      requestId: request.id,
      authorId: dto.authorId,
      authorType: dto.authorType,
      body: dto.body,
      createdAt: this.clock.now(),
    });
    return this.commentRepo.save(comment);
  }

  async getComments(externalId: string): Promise<RequestCommentEntity[]> {
    const request = await this.requestRepo.findOne({ where: { externalId } });
    if (!request) throw new RequestNotFoundException(externalId);

    return this.commentRepo.find({
      where: { requestId: request.id },
      order: { createdAt: 'ASC' },
    });
  }
}
