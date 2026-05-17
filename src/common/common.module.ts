import { Global, Module } from '@nestjs/common';
import { ClockService } from './clock.service';
import { UuidService } from './uuid.service';

@Global()
@Module({
  providers: [ClockService, UuidService],
  exports: [ClockService, UuidService],
})
export class CommonModule {}
