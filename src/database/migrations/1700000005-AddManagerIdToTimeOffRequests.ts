import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManagerIdToTimeOffRequests1700000005000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "time_off_requests" ADD COLUMN "managerId" VARCHAR NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_time_off_requests_manager_status" ON "time_off_requests" ("managerId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_time_off_requests_employee_status" ON "time_off_requests" ("employeeId", "status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_time_off_requests_employee_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_time_off_requests_manager_status"`,
    );
    // SQLite does not support DROP COLUMN — full table recreation required for rollback
  }
}
