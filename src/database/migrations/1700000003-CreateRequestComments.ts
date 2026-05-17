import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRequestComments1700000003000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "request_comments" (
        "id"         INTEGER PRIMARY KEY AUTOINCREMENT,
        "requestId"  INTEGER  NOT NULL,
        "authorId"   VARCHAR  NOT NULL,
        "authorType" VARCHAR  NOT NULL,
        "body"       TEXT     NOT NULL,
        "createdAt"  DATETIME NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_request_comments_requestId"
        ON "request_comments" ("requestId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "request_comments"`);
  }
}
