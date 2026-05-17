import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from '../../../src/common/filters/http-exception.filter';
import {
  HcmDomainException,
  HcmUnavailableException,
  InsufficientBalanceException,
  InvalidTransitionException,
  OverlapConflictException,
  RequestNotFoundException,
  HcmConfigNotFoundException,
} from '../../../src/common/exceptions';

function makeHost(json: jest.Mock): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => ({
        status: jest.fn().mockReturnThis(),
        json,
      }),
    }),
  } as unknown as ArgumentsHost;
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let json: jest.Mock;
  let host: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    json = jest.fn();
    host = makeHost(json);
  });

  it('maps RequestNotFoundException to 404 NOT_FOUND', () => {
    filter.catch(new RequestNotFoundException('abc-123'), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    );
  });

  it('maps OverlapConflictException to 409 OVERLAP_CONFLICT', () => {
    filter.catch(new OverlapConflictException(), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'OVERLAP_CONFLICT' }),
    );
  });

  it('maps InvalidTransitionException to 409 INVALID_TRANSITION', () => {
    filter.catch(new InvalidTransitionException('PENDING', 'APPROVED'), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
  });

  it('maps InsufficientBalanceException to 422 INSUFFICIENT_BALANCE', () => {
    filter.catch(new InsufficientBalanceException(), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INSUFFICIENT_BALANCE' }),
    );
  });

  it('maps HcmUnavailableException to 503 HCM_UNAVAILABLE', () => {
    filter.catch(new HcmUnavailableException(), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'HCM_UNAVAILABLE' }),
    );
  });

  it('maps HcmDomainException to 422 HCM_ERROR', () => {
    filter.catch(new HcmDomainException('bad input'), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'HCM_ERROR' }),
    );
  });

  it('maps HcmConfigNotFoundException to 422 HCM_CONFIG_NOT_FOUND', () => {
    filter.catch(new HcmConfigNotFoundException('emp-1'), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'HCM_CONFIG_NOT_FOUND' }),
    );
  });

  it('maps unexpected Error to 500 INTERNAL_ERROR', () => {
    filter.catch(new Error('boom'), host);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INTERNAL_ERROR' }),
    );
  });

  it('verifies 404 status for RequestNotFoundException', () => {
    const statusFn = jest.fn().mockReturnValue({ json: jest.fn() });
    const h = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn, json: jest.fn() }),
      }),
    } as unknown as ArgumentsHost;
    filter.catch(new RequestNotFoundException('x'), h);
    expect(statusFn).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it('verifies 503 status for HcmUnavailableException', () => {
    const statusFn = jest.fn().mockReturnValue({ json: jest.fn() });
    const h = {
      switchToHttp: () => ({
        getResponse: () => ({ status: statusFn, json: jest.fn() }),
      }),
    } as unknown as ArgumentsHost;
    filter.catch(new HcmUnavailableException(), h);
    expect(statusFn).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
