import { BalanceService } from '../../../src/balance/balance.service';
import {
  HcmConfigNotFoundException,
  HcmDomainException,
  HcmUnavailableException,
} from '../../../src/common/exceptions';
import { LeaveType } from '../../../src/common/types';
import type { HcmAdapterFactory } from '../../../src/hcm/hcm-adapter.factory';

const PARAMS = {
  employeeId: 'emp-1',
  employerId: 'er-1',
  locationId: 'loc-1',
  leaveType: LeaveType.VACATION,
  year: 2024,
};

function makeAdapter(balance: number) {
  return { getBalance: jest.fn().mockResolvedValue(balance) };
}

function makeFactory(adapter: ReturnType<typeof makeAdapter>) {
  return { getAdapter: jest.fn().mockResolvedValue(adapter) };
}

describe('BalanceService', () => {
  it('returns balance response with all dimensions', async () => {
    const service = new BalanceService(
      makeFactory(makeAdapter(168)) as unknown as HcmAdapterFactory,
    );
    const result = await service.getBalance(
      PARAMS.employeeId,
      PARAMS.employerId,
      PARAMS.locationId,
      PARAMS.leaveType,
      PARAMS.year,
    );
    expect(result).toEqual({
      employeeId: 'emp-1',
      employerId: 'er-1',
      locationId: 'loc-1',
      leaveType: LeaveType.VACATION,
      year: 2024,
      balanceHours: 168,
    });
  });

  it('calls getAdapter with the correct employerId', async () => {
    const factory = makeFactory(makeAdapter(40));
    const service = new BalanceService(factory as unknown as HcmAdapterFactory);
    await service.getBalance(
      PARAMS.employeeId,
      PARAMS.employerId,
      PARAMS.locationId,
      PARAMS.leaveType,
      PARAMS.year,
    );
    expect(factory.getAdapter).toHaveBeenCalledWith('er-1');
  });

  it('calls adapter.getBalance with the full BalanceKey', async () => {
    const adapter = makeAdapter(80);
    const service = new BalanceService(
      makeFactory(adapter) as unknown as HcmAdapterFactory,
    );
    await service.getBalance(
      PARAMS.employeeId,
      PARAMS.employerId,
      PARAMS.locationId,
      PARAMS.leaveType,
      PARAMS.year,
    );
    expect(adapter.getBalance).toHaveBeenCalledWith({
      employeeId: 'emp-1',
      employerId: 'er-1',
      locationId: 'loc-1',
      leaveType: LeaveType.VACATION,
      year: 2024,
    });
  });

  it('propagates HcmUnavailableException from adapter', async () => {
    const adapter = {
      getBalance: jest.fn().mockRejectedValue(new HcmUnavailableException()),
    };
    const service = new BalanceService(
      makeFactory(adapter) as unknown as HcmAdapterFactory,
    );
    await expect(
      service.getBalance(
        PARAMS.employeeId,
        PARAMS.employerId,
        PARAMS.locationId,
        PARAMS.leaveType,
        PARAMS.year,
      ),
    ).rejects.toBeInstanceOf(HcmUnavailableException);
  });

  it('propagates HcmDomainException from adapter', async () => {
    const adapter = {
      getBalance: jest
        .fn()
        .mockRejectedValue(new HcmDomainException('invalid dims')),
    };
    const service = new BalanceService(
      makeFactory(adapter) as unknown as HcmAdapterFactory,
    );
    await expect(
      service.getBalance(
        PARAMS.employeeId,
        PARAMS.employerId,
        PARAMS.locationId,
        PARAMS.leaveType,
        PARAMS.year,
      ),
    ).rejects.toBeInstanceOf(HcmDomainException);
  });

  it('propagates HcmConfigNotFoundException from factory', async () => {
    const factory = {
      getAdapter: jest
        .fn()
        .mockRejectedValue(new HcmConfigNotFoundException('er-1')),
    };
    const service = new BalanceService(factory as unknown as HcmAdapterFactory);
    await expect(
      service.getBalance(
        PARAMS.employeeId,
        PARAMS.employerId,
        PARAMS.locationId,
        PARAMS.leaveType,
        PARAMS.year,
      ),
    ).rejects.toBeInstanceOf(HcmConfigNotFoundException);
  });
});
