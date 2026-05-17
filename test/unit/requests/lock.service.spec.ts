import { LockService } from '../../../src/requests/lock.service';

describe('LockService', () => {
  let service: LockService;

  beforeEach(() => {
    service = new LockService();
  });

  it('executes a single task and returns its value', async () => {
    const result = await service.withLock('emp-1', () => 42);
    expect(result).toBe(42);
  });

  it('serialises concurrent tasks for the same employeeId', async () => {
    const order: number[] = [];

    const t1 = service.withLock('emp-1', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
    });
    const t2 = service.withLock('emp-1', () => {
      order.push(2);
    });

    await Promise.all([t1, t2]);
    expect(order).toEqual([1, 2]);
  });

  it('does not block tasks for different employeeIds', async () => {
    const order: number[] = [];

    const t1 = service.withLock('emp-1', async () => {
      await new Promise((r) => setTimeout(r, 20));
      order.push(1);
    });
    const t2 = service.withLock('emp-2', () => {
      order.push(2);
    });

    await Promise.all([t1, t2]);
    // emp-2 finishes before emp-1 because they run concurrently
    expect(order).toEqual([2, 1]);
  });

  it('releases the lock even when the task throws', async () => {
    await expect(
      service.withLock('emp-1', () => {
        throw new Error('task failed');
      }),
    ).rejects.toThrow('task failed');

    // Lock must be released — the next task should run immediately
    const result = await service.withLock('emp-1', () => 'ok');
    expect(result).toBe('ok');
  });

  it('propagates the error from a failing task', async () => {
    class MyError extends Error {}
    await expect(
      service.withLock('emp-1', () => {
        throw new MyError('specific error');
      }),
    ).rejects.toBeInstanceOf(MyError);
  });
});
