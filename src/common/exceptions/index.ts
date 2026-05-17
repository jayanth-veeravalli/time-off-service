import { HttpException, HttpStatus } from '@nestjs/common';

export class OverlapConflictException extends HttpException {
  constructor() {
    super(
      {
        code: 'OVERLAP_CONFLICT',
        message: 'Request overlaps with an existing request',
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class InsufficientBalanceException extends HttpException {
  constructor() {
    super(
      { code: 'INSUFFICIENT_BALANCE', message: 'Insufficient leave balance' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class HcmUnavailableException extends HttpException {
  constructor() {
    super(
      { code: 'HCM_UNAVAILABLE', message: 'HCM system is unavailable' },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export class HcmDomainException extends HttpException {
  constructor(message = 'HCM rejected the request') {
    super({ code: 'HCM_ERROR', message }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}

export class HcmConfigNotFoundException extends HttpException {
  constructor(employerId: string) {
    super(
      {
        code: 'HCM_CONFIG_NOT_FOUND',
        message: `No HCM configuration found for employer: ${employerId}`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class RequestNotFoundException extends HttpException {
  constructor(externalId: string) {
    super(
      { code: 'NOT_FOUND', message: `Request not found: ${externalId}` },
      HttpStatus.NOT_FOUND,
    );
  }
}

export class InvalidTransitionException extends HttpException {
  constructor(from: string, to: string) {
    super(
      {
        code: 'INVALID_TRANSITION',
        message: `Cannot transition from ${from} to ${to}`,
      },
      HttpStatus.CONFLICT,
    );
  }
}

export class UnauthorizedActorException extends HttpException {
  constructor() {
    super(
      {
        code: 'UNAUTHORIZED_ACTOR',
        message: 'Actor is not the assigned manager for this request',
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
