import { MigrationInterface, QueryRunner } from 'typeorm';

// SQLite does not support ALTER COLUMN — must recreate the table.
export class AlterStartEndDateToDatetime1700000006000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "time_off_requests_new" (
        "id"             INTEGER  PRIMARY KEY AUTOINCREMENT,
        "externalId"     VARCHAR  NOT NULL,
        "employeeId"     VARCHAR  NOT NULL,
        "employerId"     VARCHAR  NOT NULL,
        "locationId"     VARCHAR  NOT NULL,
        "leaveType"      VARCHAR  NOT NULL,
        "year"           INTEGER  NOT NULL,
        "startDate"      DATETIME NOT NULL,
        "endDate"        DATETIME NOT NULL,
        "requestedHours" INTEGER  NOT NULL,
        "status"         VARCHAR  NOT NULL,
        "submittedById"  VARCHAR  NOT NULL,
        "managerId"      VARCHAR  NOT NULL DEFAULT '',
        "createdAt"      DATETIME NOT NULL,
        "updatedAt"      DATETIME NOT NULL
      )
    `);

    await queryRunner.query(`
      INSERT INTO "time_off_requests_new"
        (id, externalId, employeeId, employerId, locationId, leaveType, year,
         startDate, endDate, requestedHours, status, submittedById, managerId,
         createdAt, updatedAt)
      SELECT
        id, externalId, employeeId, employerId, locationId, leaveType, year,
        startDate, endDate, requestedHours, status, submittedById, managerId,
        createdAt, updatedAt
      FROM "time_off_requests"
    `);

    await queryRunner.query(`DROP TABLE "time_off_requests"`);
    await queryRunner.query(
      `ALTER TABLE "time_off_requests_new" RENAME TO "time_off_requests"`,
    );

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
        ON "time_off_requests"
          ("employeeId", "employerId", "locationId", "leaveType", "year", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_time_off_requests_status_startDate"
        ON "time_off_requests" ("status", "startDate")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_time_off_requests_manager_status"
        ON "time_off_requests" ("managerId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_time_off_requests_employee_status"
        ON "time_off_requests" ("employeeId", "status")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "time_off_requests_old" (
        "id"             INTEGER  PRIMARY KEY AUTOINCREMENT,
        "externalId"     VARCHAR  NOT NULL,
        "employeeId"     VARCHAR  NOT NULL,
        "employerId"     VARCHAR  NOT NULL,
        "locationId"     VARCHAR  NOT NULL,
        "leaveType"      VARCHAR  NOT NULL,
        "year"           INTEGER  NOT NULL,
        "startDate"      DATE     NOT NULL,
        "endDate"        DATE     NOT NULL,
        "requestedHours" INTEGER  NOT NULL,
        "status"         VARCHAR  NOT NULL,
        "submittedById"  VARCHAR  NOT NULL,
        "managerId"      VARCHAR  NOT NULL DEFAULT '',
        "createdAt"      DATETIME NOT NULL,
        "updatedAt"      DATETIME NOT NULL
      )
    `);

    await queryRunner.query(`
      INSERT INTO "time_off_requests_old"
        (id, externalId, employeeId, employerId, locationId, leaveType, year,
         startDate, endDate, requestedHours, status, submittedById, managerId,
         createdAt, updatedAt)
      SELECT
        id, externalId, employeeId, employerId, locationId, leaveType, year,
        startDate, endDate, requestedHours, status, submittedById, managerId,
        createdAt, updatedAt
      FROM "time_off_requests"
    `);

    await queryRunner.query(`DROP TABLE "time_off_requests"`);
    await queryRunner.query(
      `ALTER TABLE "time_off_requests_old" RENAME TO "time_off_requests"`,
    );

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
        ON "time_off_requests"
          ("employeeId", "employerId", "locationId", "leaveType", "year", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_time_off_requests_status_startDate"
        ON "time_off_requests" ("status", "startDate")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_time_off_requests_manager_status"
        ON "time_off_requests" ("managerId", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_time_off_requests_employee_status"
        ON "time_off_requests" ("employeeId", "status")
    `);
  }
}
