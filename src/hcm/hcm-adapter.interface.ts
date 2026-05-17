import { BalanceKey } from '../common/types';

export interface IHcmAdapter {
  getBalance(params: BalanceKey): Promise<number>;
  debitBalance(
    params: BalanceKey & { hours: number; requestExternalId: string },
  ): Promise<void>;
  reverseDebit(
    params: BalanceKey & { hours: number; requestExternalId: string },
  ): Promise<void>;
}
