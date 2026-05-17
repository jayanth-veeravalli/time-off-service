import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployerHcmConfig1700000004000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "employer_hcm_config" (
        "id"         INTEGER PRIMARY KEY AUTOINCREMENT,
        "employerId" VARCHAR  NOT NULL,
        "hcmType"    VARCHAR  NOT NULL,
        "baseUrl"    VARCHAR  NOT NULL,
        "createdAt"  DATETIME NOT NULL,
        "updatedAt"  DATETIME NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_employer_hcm_config_employerId"
        ON "employer_hcm_config" ("employerId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "employer_hcm_config"`);
  }
}
