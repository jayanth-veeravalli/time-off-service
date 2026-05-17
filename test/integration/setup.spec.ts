import {
  buildTestModule,
  hcmMock,
  resetDb,
  seedHcmConfig,
  startMockServer,
  stopMockServer,
  DEFAULT_KEY,
} from './setup';
import { DataSource } from 'typeorm';
import { INestApplication } from '@nestjs/common';
import { typedQuery } from '../helpers/db-query';

describe('integration test setup smoke test', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    await startMockServer();
    ({ app, dataSource } = await buildTestModule());
  });

  afterAll(async () => {
    await app.close();
    await stopMockServer();
  });

  beforeEach(async () => {
    await resetDb(dataSource);
    await hcmMock.reset();
  });

  it('mock server seeds and reads balance', async () => {
    await hcmMock.seed(DEFAULT_KEY, 168);
    const balance = await hcmMock.getBalance(DEFAULT_KEY);
    expect(balance).toBe(168);
  });

  it('NestJS app boots and DataSource is connected', () => {
    expect(dataSource.isInitialized).toBe(true);
  });

  it('seedHcmConfig inserts a row readable by the app', async () => {
    await seedHcmConfig(dataSource);
    const rows = await typedQuery<{ employerId: string }>(
      dataSource,
      'SELECT * FROM employer_hcm_config',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].employerId).toBe('er-1');
  });
});
