import { HcmAdapterFactory } from '../../../src/hcm/hcm-adapter.factory';
import { WorkdayAdapter } from '../../../src/hcm/adapters/workday.adapter';
import { SapAdapter } from '../../../src/hcm/adapters/sap.adapter';
import { HcmConfigNotFoundException } from '../../../src/common/exceptions';
import { HcmType } from '../../../src/common/types';
import type { Repository } from 'typeorm';
import type { EmployerHcmConfigEntity } from '../../../src/hcm/employer-hcm-config.entity';

function makeRepo(row: object | null) {
  return { findOne: jest.fn().mockResolvedValue(row) };
}

describe('HcmAdapterFactory', () => {
  it('returns a WorkdayAdapter for hcmType WORKDAY', async () => {
    const factory = new HcmAdapterFactory(
      makeRepo({
        employerId: 'emp-1',
        hcmType: HcmType.WORKDAY,
        baseUrl: 'http://workday',
      }) as unknown as Repository<EmployerHcmConfigEntity>,
    );
    const adapter = await factory.getAdapter('emp-1');
    expect(adapter).toBeInstanceOf(WorkdayAdapter);
  });

  it('returns a SapAdapter for hcmType SAP', async () => {
    const factory = new HcmAdapterFactory(
      makeRepo({
        employerId: 'emp-1',
        hcmType: HcmType.SAP,
        baseUrl: 'http://sap',
      }) as unknown as Repository<EmployerHcmConfigEntity>,
    );
    const adapter = await factory.getAdapter('emp-1');
    expect(adapter).toBeInstanceOf(SapAdapter);
  });

  it('throws HcmConfigNotFoundException when no config row exists', async () => {
    const factory = new HcmAdapterFactory(
      makeRepo(null) as unknown as Repository<EmployerHcmConfigEntity>,
    );
    await expect(factory.getAdapter('unknown-emp')).rejects.toBeInstanceOf(
      HcmConfigNotFoundException,
    );
  });

  it('throws for an unrecognised hcmType', async () => {
    const factory = new HcmAdapterFactory(
      makeRepo({
        employerId: 'emp-1',
        hcmType: 'ORACLE',
        baseUrl: 'http://oracle',
      }) as unknown as Repository<EmployerHcmConfigEntity>,
    );
    await expect(factory.getAdapter('emp-1')).rejects.toThrow(
      'Unsupported HCM type: ORACLE',
    );
  });
});
