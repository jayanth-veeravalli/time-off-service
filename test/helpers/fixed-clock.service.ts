import { ClockService } from '../../src/common/clock.service';

export class FixedClockService extends ClockService {
  private fixedTime: Date = new Date('2024-01-15T12:00:00.000Z');

  setTime(date: Date): void {
    this.fixedTime = date;
  }

  override now(): Date {
    return new Date(this.fixedTime);
  }
}
