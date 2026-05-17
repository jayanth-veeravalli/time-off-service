export enum LeaveType {
  VACATION = 'VACATION',
  SICK = 'SICK',
}

export enum RequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  CANCELLED = 'CANCELLED',
}

export enum ActorType {
  EMPLOYEE = 'EMPLOYEE',
  MANAGER = 'MANAGER',
  SYSTEM = 'SYSTEM',
}

export enum AuthorType {
  EMPLOYEE = 'EMPLOYEE',
  MANAGER = 'MANAGER',
}

export enum HcmType {
  WORKDAY = 'WORKDAY',
  SAP = 'SAP',
}

export type BalanceKey = {
  employerId: string;
  employeeId: string;
  locationId: string;
  leaveType: LeaveType;
  year: number;
};
