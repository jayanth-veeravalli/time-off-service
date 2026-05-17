import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { LeaveType } from '../common/types';
import { RequestStatus } from '../common/types';

@Entity('time_off_requests')
@Index(['employeeId', 'employerId', 'locationId', 'leaveType', 'year', 'status'])
@Index(['status', 'startDate'])
export class TimeOffRequestEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ nullable: false })
  externalId: string;

  @Index()
  @Column({ nullable: false })
  employeeId: string;

  @Index()
  @Column({ nullable: false })
  employerId: string;

  @Index()
  @Column({ nullable: false })
  locationId: string;

  @Column({ type: 'varchar', nullable: false })
  leaveType: LeaveType;

  @Column({ nullable: false })
  year: number;

  @Column({ nullable: false })
  startDate: string;

  @Column({ nullable: false })
  endDate: string;

  @Column({ nullable: false })
  requestedHours: number;

  @Column({ type: 'varchar', nullable: false })
  status: RequestStatus;

  @Column({ nullable: false })
  submittedById: string;

  @Column({ nullable: false })
  managerId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
