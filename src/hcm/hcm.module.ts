import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployerHcmConfigEntity } from './employer-hcm-config.entity';
import { HcmAdapterFactory } from './hcm-adapter.factory';

@Module({
  imports: [TypeOrmModule.forFeature([EmployerHcmConfigEntity])],
  providers: [HcmAdapterFactory],
  exports: [HcmAdapterFactory],
})
export class HcmModule {}
