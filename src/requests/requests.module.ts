import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentsModule } from '../comments/comments.module';
import { HcmModule } from '../hcm/hcm.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TimeOffRequestEntity } from './time-off-request.entity';
import { RequestStateTransitionEntity } from './request-state-transition.entity';
import { RequestsController } from './requests.controller';
import { RequestsRepository } from './requests.repository';
import { RequestsService } from './requests.service';
import { LockService } from './lock.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TimeOffRequestEntity,
      RequestStateTransitionEntity,
    ]),
    CommentsModule,
    HcmModule,
    NotificationsModule,
  ],
  controllers: [RequestsController],
  providers: [RequestsService, RequestsRepository, LockService],
  exports: [RequestsService, RequestsRepository],
})
export class RequestsModule {}
