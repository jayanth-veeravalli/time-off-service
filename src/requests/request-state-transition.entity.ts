import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ActorType, RequestStatus } from '../common/types';

@Entity('request_state_transitions')
@Index(['requestId'])
export class RequestStateTransitionEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  requestId: number;

  @Column({ type: 'varchar', nullable: true })
  fromState: RequestStatus | null;

  @Column({ type: 'varchar', nullable: false })
  toState: RequestStatus;

  @Column({ nullable: false })
  actorId: string;

  @Column({ type: 'varchar', nullable: false })
  actorType: ActorType;

  @CreateDateColumn()
  createdAt: Date;
}
