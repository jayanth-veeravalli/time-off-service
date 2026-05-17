import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HcmType } from '../common/types';
import { HcmConfigNotFoundException } from '../common/exceptions';
import { EmployerHcmConfigEntity } from './employer-hcm-config.entity';
import { IHcmAdapter } from './hcm-adapter.interface';
import { WorkdayAdapter } from './adapters/workday.adapter';
import { SapAdapter } from './adapters/sap.adapter';

@Injectable()
export class HcmAdapterFactory {
  constructor(
    @InjectRepository(EmployerHcmConfigEntity)
    private readonly configRepo: Repository<EmployerHcmConfigEntity>,
  ) {}

  async getAdapter(employerId: string): Promise<IHcmAdapter> {
    const config = await this.configRepo.findOne({ where: { employerId } });
    if (!config) {
      throw new HcmConfigNotFoundException(employerId);
    }

    switch (config.hcmType) {
      case HcmType.WORKDAY:
        return new WorkdayAdapter(config.baseUrl);
      case HcmType.SAP:
        return new SapAdapter(config.baseUrl);
      default:
        throw new Error(`Unsupported HCM type: ${String(config.hcmType)}`);
    }
  }
}
