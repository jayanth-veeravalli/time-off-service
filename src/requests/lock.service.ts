import { Injectable } from '@nestjs/common';

@Injectable()
export class LockService {
  private readonly locks = new Map<string, Promise<void>>();

  async withLock<T>(employeeId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(employeeId) ?? Promise.resolve();

    let release!: () => void;
    // This promise resolves when the current holder calls release()
    const acquired = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Set our promise as the new tail so the next caller waits for us
    this.locks.set(employeeId, acquired);

    // Wait for the previous holder to finish
    await previous;

    try {
      return await fn();
    } finally {
      release();
      // Remove the map entry only if nobody else queued after us
      if (this.locks.get(employeeId) === acquired) {
        this.locks.delete(employeeId);
      }
    }
  }
}
