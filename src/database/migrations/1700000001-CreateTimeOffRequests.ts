import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTimeOffRequests1700000001000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "time_off_requests" (
        "id"             INTEGER PRIMARY KEY AUTOINCREMENT,
        "externalId"     VARCHAR NOT NULL,
        "employeeId"     VARCHAR NOT NULL,
        "employerId"     VARCHAR NOT NULL,
        "locationId"     VARCHAR NOT NULL,
        "leaveType"      VARCHAR NOT NULL,
        "year"           INTEGER NOT NULL,
        "startDate"      DATE    NOT NULL,
        "endDate"        DATE    NOT NULL,
        "requestedHours" INTEGER NOT NULL,
        "status"         VARCHAR NOT NULL,
        "submittedById"  VARCHAR NOT NULL,
        "createdAt"      DATETIME NOT NULL,
        "updatedAt"      DATETIME NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_time_off_requests_externalId"
        ON "time_off_requests" ("externalId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_time_off_requests_employeeId"
        ON "time_off_requests" ("employeeId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_time_off_requests_employerId"
        ON "time_off_requests" ("employerId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_time_off_requests_locationId"
        ON "time_off_requests" ("locationId")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_time_off_requests_dimensions_status"
        ON "time_off_requests" ("employeeId", "employerId", "locationId", "leaveType", "year", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_time_off_requests_status_startDate"
        ON "time_off_requests" ("status", "startDate")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "time_off_requests"`);
  }
}
