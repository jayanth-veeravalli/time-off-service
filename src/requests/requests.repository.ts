import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LeaveType, RequestStatus, ActorType } from '../common/types';
import { TimeOffRequestEntity } from './time-off-request.entity';
import { RequestStateTransitionEntity } from './request-state-transition.entity';

@Injectable()
export class RequestsRepository {
  constructor(
    @InjectRepository(TimeOffRequestEntity)
    private readonly requestRepo: Repository<TimeOffRequestEntity>,
    @InjectRepository(RequestStateTransitionEntity)
    private readonly transitionRepo: Repository<RequestStateTransitionEntity>,
    private readonly dataSource: DataSource,
  ) {}

  findByExternalId(externalId: string): Promise<TimeOffRequestEntity | null> {
    return this.requestRepo.findOne({ where: { externalId } });
  }

  findOverlapping(
    employeeId: string,
    employerId: string,
    locationId: string,
    leaveType: LeaveType,
    year: number,
    startDate: string,
    endDate: string,
  ): Promise<TimeOffRequestEntity[]> {
    return this.requestRepo
      .createQueryBuilder('r')
      .where('r.employeeId = :employeeId', { employeeId })
      .andWhere('r.employerId = :employerId', { employerId })
      .andWhere('r.locationId = :locationId', { locationId })
      .andWhere('r.leaveType = :leaveType', { leaveType })
      .andWhere('r.year = :year', { year })
      .andWhere('r.status IN (:...statuses)', {
        statuses: [RequestStatus.PENDING, RequestStatus.APPROVED],
      })
      .andWhere('r.startDate <= :endDate', { endDate })
      .andWhere('r.endDate >= :startDate', { startDate })
      .getMany();
  }

  async sumPendingHours(
    employeeId: string,
    employerId: string,
    locationId: string,
    leaveType: LeaveType,
    year: number,
    excludeExternalId?: string,
  ): Promise<number> {
    const qb = this.requestRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.requestedHours), 0)', 'total')
      .where('r.employeeId = :employeeId', { employeeId })
      .andWhere('r.employerId = :employerId', { employerId })
      .andWhere('r.locationId = :locationId', { locationId })
      .andWhere('r.leaveType = :leaveType', { leaveType })
      .andWhere('r.year = :year', { year })
      .andWhere('r.status = :status', { status: RequestStatus.PENDING });

    if (excludeExternalId) {
      qb.andWhere('r.externalId != :excludeExternalId', { excludeExternalId });
    }

    const result = await qb.getRawOne<{ total: string }>();
    return parseInt(result?.total ?? '0', 10);
  }

  insertRequest(
    data: Omit<TimeOffRequestEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<TimeOffRequestEntity> {
    const entity = this.requestRepo.create(data);
    return this.requestRepo.save(entity);
  }

  async transitionStatus(
    externalId: string,
    fromStatus: RequestStatus | null,
    toStatus: RequestStatus,
    actorId: string,
    actorType: ActorType,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      if (fromStatus !== null) {
        const result = await manager
          .createQueryBuilder()
          .update(TimeOffRequestEntity)
          .set({ status: toStatus, updatedAt: new Date() })
          .where('externalId = :externalId', { externalId })
          .andWhere('status = :fromStatus', { fromStatus })
          .execute();

        if (!result.affected || result.affected === 0) {
          return false;
        }
      }

      const request = await manager.findOne(TimeOffRequestEntity, {
        where: { externalId },
      });
      if (!request) return false;

      const transition = manager.create(RequestStateTransitionEntity, {
        requestId: request.id,
        fromState: fromStatus,
        toState: toStatus,
        actorId,
        actorType,
        createdAt: new Date(),
      });
      await manager.save(RequestStateTransitionEntity, transition);

      return true;
    });
  }

  async updateManagerId(
    externalId: string,
    managerId: string,
  ): Promise<TimeOffRequestEntity> {
    await this.requestRepo.update({ externalId }, { managerId });
    return this.requestRepo.findOne({
      where: { externalId },
    }) as Promise<TimeOffRequestEntity>;
  }

  findPendingByStartDateBefore(date: string): Promise<TimeOffRequestEntity[]> {
    return this.requestRepo
      .createQueryBuilder('r')
      .where('r.status = :status', { status: RequestStatus.PENDING })
      .andWhere('r.startDate < :date', { date })
      .getMany();
  }

  findPendingByStartDateOnOrAfter(
    date: string,
  ): Promise<TimeOffRequestEntity[]> {
    return this.requestRepo
      .createQueryBuilder('r')
      .where('r.status = :status', { status: RequestStatus.PENDING })
      .andWhere('r.startDate >= :date', { date })
      .getMany();
  }

  async findByFilter(opts: {
    managerId?: string;
    employeeId?: string;
    status?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: TimeOffRequestEntity[]; total: number }> {
    const qb = this.requestRepo.createQueryBuilder('r');
    if (opts.managerId)
      qb.andWhere('r.managerId = :managerId', { managerId: opts.managerId });
    if (opts.employeeId)
      qb.andWhere('r.employeeId = :employeeId', {
        employeeId: opts.employeeId,
      });
    if (opts.status) qb.andWhere('r.status = :status', { status: opts.status });
    qb.orderBy('r.createdAt', 'DESC').skip(opts.offset).take(opts.limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  findTransitionsByRequestId(
    requestId: number,
  ): Promise<RequestStateTransitionEntity[]> {
    return this.transitionRepo.find({
      where: { requestId },
      order: { createdAt: 'ASC' },
    });
  }
}
