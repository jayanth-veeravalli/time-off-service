import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

@Injectable()
export class UuidService {
  generate(): string {
    return randomUUID();
  }
}
