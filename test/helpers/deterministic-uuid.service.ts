import { UuidService } from '../../src/common/uuid.service';

export class DeterministicUuidService extends UuidService {
  private counter = 1;

  reset(): void {
    this.counter = 1;
  }

  override generate(): string {
    const padded = String(this.counter++).padStart(12, '0');
    return `00000000-0000-0000-0000-${padded}`;
  }
}
