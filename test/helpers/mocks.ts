export function makeRepo(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    findByExternalId: jest.fn(),
    findOverlapping: jest.fn().mockResolvedValue([]),
    sumPendingHours: jest.fn().mockResolvedValue(0),
    insertRequest: jest.fn().mockImplementation((data: unknown) => Promise.resolve({ id: 1, ...data as object })),
    transitionStatus: jest.fn().mockResolvedValue(true),
    findByFilter: jest.fn().mockResolvedValue([]),
    updateManagerId: jest.fn().mockResolvedValue(true),
    ...overrides,
  };
}

export function makeAdapter(balance = 80) {
  return {
    getBalance: jest.fn().mockResolvedValue(balance),
    debitBalance: jest.fn().mockResolvedValue(undefined),
    reverseDebit: jest.fn().mockResolvedValue(undefined),
  };
}

export function makeHcmFactory(adapter = makeAdapter()) {
  return {
    getAdapter: jest.fn().mockResolvedValue(adapter),
  };
}

export function makeNotifications() {
  return {
    notifyEmployee: jest.fn(),
    notifyPendingRequests: jest.fn(),
  };
}

export function makeLock() {
  return {
    withLock: jest.fn().mockImplementation((_key: string, fn: () => Promise<unknown>) => fn()),
  };
}

export function makeComments() {
  return {
    addComment: jest.fn().mockResolvedValue(undefined),
    getComments: jest.fn().mockResolvedValue([]),
  };
}
