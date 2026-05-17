import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as path from 'path';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'better-sqlite3',
        database: config.get<string>('DATABASE_PATH', ':memory:'),
        synchronize: false,
        migrationsRun: true,
        migrations: [path.join(__dirname, 'migrations', '*{.ts,.js}')],
        entities: [path.join(__dirname, '..', '**', '*.entity{.ts,.js}')],
      }),
    }),
  ],
})
export class DatabaseModule {}
