import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { CommonModule } from './common/common.module';
import { HcmModule } from './hcm/hcm.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RequestsModule } from './requests/requests.module';
import { BalanceModule } from './balance/balance.module';
import { CommentsModule } from './comments/comments.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    CommonModule,
    HcmModule,
    NotificationsModule,
    RequestsModule,
    BalanceModule,
    CommentsModule,
    SchedulerModule,
  ],
})
export class AppModule {}
