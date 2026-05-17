import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStartEndDateIndexes1700000007000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_time_off_requests_startDate" ON "time_off_requests" ("startDate")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_time_off_requests_endDate" ON "time_off_requests" ("endDate")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_time_off_requests_endDate"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_time_off_requests_startDate"`,
    );
  }
}
