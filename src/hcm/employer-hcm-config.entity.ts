import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { HcmType } from '../common/types';

@Entity('employer_hcm_config')
export class EmployerHcmConfigEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ nullable: false })
  employerId: string;

  @Column({ type: 'varchar', nullable: false })
  hcmType: HcmType;

  @Column({ nullable: false })
  baseUrl: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
