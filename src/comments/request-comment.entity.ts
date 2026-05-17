import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuthorType } from '../common/types';

@Entity('request_comments')
@Index(['requestId'])
export class RequestCommentEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: false })
  requestId: number;

  @Column({ nullable: false })
  authorId: string;

  @Column({ type: 'varchar', nullable: false })
  authorType: AuthorType;

  @Column({ type: 'text', nullable: false })
  body: string;

  @CreateDateColumn()
  createdAt: Date;
}
