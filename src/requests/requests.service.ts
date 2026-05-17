import { BadRequestException, Injectable } from '@nestjs/common';
import { ClockService } from '../common/clock.service';
import { UuidService } from '../common/uuid.service';
import {
  InsufficientBalanceException,
  InvalidTransitionException,
  OverlapConflictException,
  RequestNotFoundException,
  UnauthorizedActorException,
} from '../common/exceptions';
import { ActorType, AuthorType, RequestStatus } from '../common/types';
import { CommentsService } from '../comments/comments.service';
import { HcmAdapterFactory } from '../hcm/hcm-adapter.factory';
import { NotificationsService } from '../notifications/notifications.service';
import { ListRequestsDto } from './dto/list-requests.dto';
import { SubmitRequestDto } from './dto/submit-request.dto';
import { LockService } from './lock.service';
import { RequestsRepository } from './requests.repository';
import { TimeOffRequestEntity } from './time-off-request.entity';
import { RequestStateTransitionEntity } from './request-state-transition.entity';

@Injectable()
export class RequestsService {
  constructor(
    private readonly repo: RequestsRepository,
    private readonly lock: LockService,
    private readonly hcmFactory: HcmAdapterFactory,
    private readonly notifications: NotificationsService,
    private readonly comments: CommentsService,
    private readonly clock: ClockService,
    private readonly uuid: UuidService,
  ) {}

  async submit(dto: SubmitRequestDto): Promise<TimeOffRequestEntity> {
    const overlapping = await this.repo.findOverlapping(
      dto.employeeId,
      dto.employerId,
      dto.locationId,
      dto.leaveType,
      dto.year,
      dto.startDate,
      dto.endDate,
    );
    if (overlapping.length > 0) {
      throw new OverlapConflictException();
    }

    return this.lock.withLock(dto.employeeId, async () => {
      const adapter = await this.hcmFactory.getAdapter(dto.employerId);
      const balance = await adapter.getBalance({
        employerId: dto.employerId,
        employeeId: dto.employeeId,
        locationId: dto.locationId,
        leaveType: dto.leaveType,
        year: dto.year,
      });

      const pendingHours = await this.repo.sumPendingHours(
        dto.employeeId,
        dto.employerId,
        dto.locationId,
        dto.leaveType,
        dto.year,
      );

      if (pendingHours + dto.requestedHours > balance) {
        throw new InsufficientBalanceException();
      }

      const now = this.clock.now();
      const request = await this.repo.insertRequest({
        externalId: this.uuid.generate(),
        employeeId: dto.employeeId,
        employerId: dto.employerId,
        locationId: dto.locationId,
        leaveType: dto.leaveType,
        year: dto.year,
        startDate: dto.startDate,
        endDate: dto.endDate,
        requestedHours: dto.requestedHours,
        status: RequestStatus.PENDING,
        submittedById: dto.submittedById,
        managerId: dto.managerId,
      });

      await this.repo.transitionStatus(
        request.externalId,
        null,
        RequestStatus.PENDING,
        dto.submittedById,
        ActorType.EMPLOYEE,
      );

      return request;
    });
  }

  async approve(externalId: string, actorId: string): Promise<TimeOffRequestEntity> {
    const request = await this.repo.findByExternalId(externalId);
    if (!request) throw new RequestNotFoundException(externalId);

    if (request.managerId !== actorId) throw new UnauthorizedActorException();

    if (request.status === RequestStatus.APPROVED) {
      return request;
    }
    if (request.status !== RequestStatus.PENDING) {
      throw new InvalidTransitionException(request.status, RequestStatus.APPROVED);
    }

    return this.lock.withLock(request.employeeId, async () => {
      const fresh = await this.repo.findByExternalId(externalId);
      if (!fresh) throw new RequestNotFoundException(externalId);

      if (fresh.status === RequestStatus.APPROVED) {
        return fresh;
      }
      if (fresh.status !== RequestStatus.PENDING) {
        throw new InvalidTransitionException(fresh.status, RequestStatus.APPROVED);
      }

      const adapter = await this.hcmFactory.getAdapter(fresh.employerId);
      const balance = await adapter.getBalance({
        employerId: fresh.employerId,
        employeeId: fresh.employeeId,
        locationId: fresh.locationId,
        leaveType: fresh.leaveType,
        year: fresh.year,
      });

      const otherPendingHours = await this.repo.sumPendingHours(
        fresh.employeeId,
        fresh.employerId,
        fresh.locationId,
        fresh.leaveType,
        fresh.year,
        fresh.externalId,
      );

      if (fresh.requestedHours + otherPendingHours > balance) {
        throw new InsufficientBalanceException();
      }

      await adapter.debitBalance({
        employerId: fresh.employerId,
        employeeId: fresh.employeeId,
        locationId: fresh.locationId,
        leaveType: fresh.leaveType,
        year: fresh.year,
        hours: fresh.requestedHours,
        requestExternalId: fresh.externalId,
      });

      await this.repo.transitionStatus(
        externalId,
        RequestStatus.PENDING,
        RequestStatus.APPROVED,
        actorId,
        ActorType.MANAGER,
      );

      this.notifications.notifyEmployee(fresh.employeeId, RequestStatus.APPROVED, externalId);

      return (await this.repo.findByExternalId(externalId))!;
    });
  }

  async reject(externalId: string, actorId: string, comment?: string): Promise<TimeOffRequestEntity> {
    const request = await this.repo.findByExternalId(externalId);
    if (!request) throw new RequestNotFoundException(externalId);

    if (request.managerId !== actorId) throw new UnauthorizedActorException();

    if (request.status === RequestStatus.REJECTED) {
      return request;
    }
    if (request.status !== RequestStatus.PENDING) {
      throw new InvalidTransitionException(request.status, RequestStatus.REJECTED);
    }

    await this.repo.transitionStatus(
      externalId,
      RequestStatus.PENDING,
      RequestStatus.REJECTED,
      actorId,
      ActorType.MANAGER,
    );

    if (comment) {
      await this.comments.addComment(externalId, {
        authorId: actorId,
        authorType: AuthorType.MANAGER,
        body: comment,
      });
    }

    this.notifications.notifyEmployee(request.employeeId, RequestStatus.REJECTED, externalId);

    return (await this.repo.findByExternalId(externalId))!;
  }

  async withdraw(externalId: string, actorId: string): Promise<TimeOffRequestEntity> {
    const request = await this.repo.findByExternalId(externalId);
    if (!request) throw new RequestNotFoundException(externalId);

    if (request.status === RequestStatus.WITHDRAWN) {
      return request;
    }

    if (request.status === RequestStatus.PENDING) {
      await this.repo.transitionStatus(
        externalId,
        RequestStatus.PENDING,
        RequestStatus.WITHDRAWN,
        actorId,
        ActorType.EMPLOYEE,
      );
      this.notifications.notifyEmployee(request.employeeId, RequestStatus.WITHDRAWN, externalId);
      return (await this.repo.findByExternalId(externalId))!;
    }

    if (request.status === RequestStatus.APPROVED) {
      return this.lock.withLock(request.employeeId, async () => {
        const fresh = await this.repo.findByExternalId(externalId);
        if (!fresh) throw new RequestNotFoundException(externalId);

        if (fresh.status === RequestStatus.WITHDRAWN) {
          return fresh;
        }
        if (fresh.status !== RequestStatus.APPROVED) {
          throw new InvalidTransitionException(fresh.status, RequestStatus.WITHDRAWN);
        }

        const adapter = await this.hcmFactory.getAdapter(fresh.employerId);
        await adapter.reverseDebit({
          employerId: fresh.employerId,
          employeeId: fresh.employeeId,
          locationId: fresh.locationId,
          leaveType: fresh.leaveType,
          year: fresh.year,
          hours: fresh.requestedHours,
          requestExternalId: fresh.externalId,
        });

        await this.repo.transitionStatus(
          externalId,
          RequestStatus.APPROVED,
          RequestStatus.WITHDRAWN,
          actorId,
          ActorType.EMPLOYEE,
        );

        this.notifications.notifyEmployee(fresh.employeeId, RequestStatus.WITHDRAWN, externalId);
        return (await this.repo.findByExternalId(externalId))!;
      });
    }

    throw new InvalidTransitionException(request.status, RequestStatus.WITHDRAWN);
  }

  async listRequests(
    dto: ListRequestsDto,
  ): Promise<{ items: TimeOffRequestEntity[]; total: number; limit: number; offset: number }> {
    if (!dto.managerId && !dto.employeeId) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Either managerId or employeeId is required' });
    }
    if (dto.managerId && dto.employeeId) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Provide either managerId or employeeId, not both' });
    }
    const limit = dto.limit ?? 20;
    const offset = dto.offset ?? 0;
    const { items, total } = await this.repo.findByFilter({
      managerId: dto.managerId,
      employeeId: dto.employeeId,
      status: dto.status,
      limit,
      offset,
    });
    return { items, total, limit, offset };
  }

  async reassignManager(externalId: string, managerId: string): Promise<TimeOffRequestEntity> {
    const request = await this.repo.findByExternalId(externalId);
    if (!request) throw new RequestNotFoundException(externalId);
    if (request.status !== RequestStatus.PENDING) {
      throw new InvalidTransitionException(request.status, 'PENDING');
    }
    return this.repo.updateManagerId(externalId, managerId);
  }

  async getRequest(
    externalId: string,
  ): Promise<TimeOffRequestEntity & { transitions: RequestStateTransitionEntity[] }> {
    const request = await this.repo.findByExternalId(externalId);
    if (!request) throw new RequestNotFoundException(externalId);

    const transitions = await this.repo.findTransitionsByRequestId(request.id);
    return { ...request, transitions };
  }
}
