import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddToolCallTable1809000000000 implements MigrationInterface {
    name = 'AddToolCallTable1809000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "tool_call" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "executionId" character varying(21) NOT NULL,
                "projectId" character varying(21) NOT NULL,
                "pieceName" character varying NOT NULL,
                "pieceVersion" character varying NOT NULL,
                "actionName" character varying NOT NULL,
                "connectionId" character varying(21),
                "input" json NOT NULL DEFAULT '{}',
                "output" json,
                "status" character varying NOT NULL,
                "error" json,
                "latencyMs" numeric,
                "finished" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "pk_tool_call_id" PRIMARY KEY ("id")
            )
        `)

        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_tool_call_execution_id" ON "tool_call" ("executionId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_tool_call_project_id" ON "tool_call" ("projectId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_tool_call_created" ON "tool_call" ("created")')

        await queryRunner.query(`
            ALTER TABLE "tool_call"
            ADD CONSTRAINT "fk_tool_call_execution_id"
            FOREIGN KEY ("executionId") REFERENCES "execution"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `)

        await queryRunner.query(`
            ALTER TABLE "tool_call"
            ADD CONSTRAINT "fk_tool_call_project_id"
            FOREIGN KEY ("projectId") REFERENCES "project"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "tool_call" DROP CONSTRAINT IF EXISTS "fk_tool_call_project_id"')
        await queryRunner.query('ALTER TABLE "tool_call" DROP CONSTRAINT IF EXISTS "fk_tool_call_execution_id"')
        await queryRunner.query('DROP TABLE IF EXISTS "tool_call"')
    }
}
