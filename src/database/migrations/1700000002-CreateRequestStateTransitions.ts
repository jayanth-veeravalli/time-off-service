import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRequestStateTransitions1700000002000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "request_state_transitions" (
        "id"         INTEGER PRIMARY KEY AUTOINCREMENT,
        "requestId"  INTEGER  NOT NULL,
        "fromState"  VARCHAR,
        "toState"    VARCHAR  NOT NULL,
        "actorId"    VARCHAR  NOT NULL,
        "actorType"  VARCHAR  NOT NULL,
        "createdAt"  DATETIME NOT NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_request_state_transitions_requestId"
        ON "request_state_transitions" ("requestId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "request_state_transitions"`);
  }
}
