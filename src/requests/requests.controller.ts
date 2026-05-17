import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { ApproveRequestDto } from './dto/approve-request.dto';
import { ListRequestsDto } from './dto/list-requests.dto';
import { ReassignManagerDto } from './dto/reassign-manager.dto';
import { RejectRequestDto } from './dto/reject-request.dto';
import { WithdrawRequestDto } from './dto/withdraw-request.dto';
import { SubmitRequestDto } from './dto/submit-request.dto';
import { RequestsService } from './requests.service';

@Controller()
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Get('requests')
  listRequests(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    dto: ListRequestsDto,
  ) {
    return this.service.listRequests(dto);
  }

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: SubmitRequestDto,
  ) {
    return this.service.submit(dto);
  }

  @Get('requests/:externalId')
  getRequest(@Param('externalId') externalId: string) {
    return this.service.getRequest(externalId);
  }

  @Patch('requests/:externalId/manager')
  @HttpCode(HttpStatus.OK)
  reassignManager(
    @Param('externalId') externalId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: ReassignManagerDto,
  ) {
    return this.service.reassignManager(externalId, dto.managerId);
  }

  @Post('requests/:externalId/approve')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('externalId') externalId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: ApproveRequestDto,
  ) {
    return this.service.approve(externalId, dto.actorId);
  }

  @Post('requests/:externalId/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('externalId') externalId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: RejectRequestDto,
  ) {
    return this.service.reject(externalId, dto.actorId, dto.comment);
  }

  @Post('requests/:externalId/withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(
    @Param('externalId') externalId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    dto: WithdrawRequestDto,
  ) {
    return this.service.withdraw(externalId, dto.actorId);
  }
}
