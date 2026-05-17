import axios from 'axios';
import { BalanceKey } from '../../common/types';
import {
  HcmDomainException,
  HcmUnavailableException,
} from '../../common/exceptions';
import { IHcmAdapter } from '../hcm-adapter.interface';

const TIMEOUT_MS = 5000;

export class SapAdapter implements IHcmAdapter {
  constructor(private readonly baseUrl: string) {}

  async getBalance(params: BalanceKey): Promise<number> {
    try {
      const response = await axios.get<{ balanceHours: number }>(
        `${this.baseUrl}/api/leave/balance`,
        { params, timeout: TIMEOUT_MS },
      );
      return response.data.balanceHours;
    } catch (err) {
      throw mapAxiosError(err);
    }
  }

  async debitBalance(
    params: BalanceKey & { hours: number; requestExternalId: string },
  ): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/api/leave/debit`, params, {
        timeout: TIMEOUT_MS,
      });
    } catch (err) {
      throw mapAxiosError(err);
    }
  }

  async reverseDebit(
    params: BalanceKey & { hours: number; requestExternalId: string },
  ): Promise<void> {
    try {
      await axios.post(`${this.baseUrl}/api/leave/reverse`, params, {
        timeout: TIMEOUT_MS,
      });
    } catch (err) {
      throw mapAxiosError(err);
    }
  }
}

function mapAxiosError(
  err: unknown,
): HcmUnavailableException | HcmDomainException {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status && status >= 400 && status < 500) {
      const data = err.response?.data as { message?: string } | undefined;
      return new HcmDomainException(data?.message ?? 'HCM domain error');
    }
  }
  return new HcmUnavailableException();
}
