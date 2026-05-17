import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: process.env.DATABASE_PATH ?? './time-off.db',
  synchronize: false,
  migrationsRun: true,
  migrations: [path.join(__dirname, 'migrations', '*{.ts,.js}')],
  entities: [path.join(__dirname, '..', '**', '*.entity{.ts,.js}')],
});
