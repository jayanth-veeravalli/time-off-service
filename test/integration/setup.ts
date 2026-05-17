import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { ClockService } from '../../src/common/clock.service';
import { UuidService } from '../../src/common/uuid.service';
import { FixedClockService } from '../helpers/fixed-clock.service';
import { DeterministicUuidService } from '../helpers/deterministic-uuid.service';
import * as mockServer from '../mocks/hcm-mock-server/index';

// ─── mock server lifecycle (one server shared across all integration suites) ──

let mockPort: number;

export async function startMockServer(): Promise<void> {
  await mockServer.start();
  mockPort = mockServer.getPort();
}

export async function stopMockServer(): Promise<void> {
  await mockServer.stop();
}

// ─── NestJS test module ───────────────────────────────────────────────────────

export const fixedClock = new FixedClockService();
export const deterministicUuid = new DeterministicUuidService();

export async function buildTestModule(): Promise<{
  app: INestApplication;
  module: TestingModule;
  dataSource: DataSource;
}> {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ClockService)
    .useValue(fixedClock)
    .overrideProvider(UuidService)
    .useValue(deterministicUuid)
    .compile();

  const app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();

  const dataSource = module.get(DataSource);
  return { app, module, dataSource };
}

// ─── DB reset between tests ───────────────────────────────────────────────────

export async function resetDb(dataSource: DataSource): Promise<void> {
  await dataSource.query('DELETE FROM request_comments');
  await dataSource.query('DELETE FROM request_state_transitions');
  await dataSource.query('DELETE FROM time_off_requests');
  await dataSource.query('DELETE FROM employer_hcm_config');
}

// ─── HCM mock HTTP client ─────────────────────────────────────────────────────

export type MockMode =
  | 'NORMAL'
  | 'INSUFFICIENT_BALANCE'
  | 'INVALID_DIMENSIONS'
  | 'SERVER_ERROR'
  | 'TIMEOUT'
  | 'SILENT_ACCEPT'
  | 'REVERSAL_ERROR';

export interface BalanceKey {
  employerId: string;
  employeeId: string;
  locationId: string;
  leaveType: string;
  year: number;
}

function hcmBaseUrl(): string {
  return `http://localhost:${mockPort}`;
}

export const hcmMock = {
  url(): string {
    return hcmBaseUrl();
  },

  async seed(key: BalanceKey, balanceHours: number): Promise<void> {
    await axios.post(`${hcmBaseUrl()}/mock/seed`, { key, balanceHours });
  },

  async reset(): Promise<void> {
    await axios.post(`${hcmBaseUrl()}/mock/reset`);
  },

  async configure(mode: MockMode, delayMs?: number): Promise<void> {
    await axios.post(`${hcmBaseUrl()}/mock/configure`, { mode, delayMs });
  },

  async mutate(key: BalanceKey, balanceHours: number): Promise<void> {
    await axios.post(`${hcmBaseUrl()}/mock/mutate`, { key, balanceHours });
  },

  async getDebits(): Promise<Record<string, number>> {
    const res = await axios.get(`${hcmBaseUrl()}/mock/debits`);
    return res.data as Record<string, number>;
  },

  async getBalance(key: BalanceKey): Promise<number> {
    const res = await axios.get(`${hcmBaseUrl()}/mock/balance`, {
      params: key,
    });
    return (res.data as { balanceHours: number }).balanceHours;
  },
};

// ─── seed HCM config row ──────────────────────────────────────────────────────

export async function seedHcmConfig(
  dataSource: DataSource,
  employerId = 'er-1',
): Promise<void> {
  await dataSource.query(
    `INSERT INTO employer_hcm_config (employerId, hcmType, baseUrl, createdAt, updatedAt)
     VALUES (?, 'WORKDAY', ?, datetime('now'), datetime('now'))`,
    [employerId, hcmMock.url()],
  );
}

// ─── default test dimensions ──────────────────────────────────────────────────

export const DEFAULT_KEY: BalanceKey = {
  employerId: 'er-1',
  employeeId: 'emp-1',
  locationId: 'loc-1',
  leaveType: 'VACATION',
  year: 2024,
};
