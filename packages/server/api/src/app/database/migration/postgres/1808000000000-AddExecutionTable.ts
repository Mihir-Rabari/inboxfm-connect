import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddExecutionTable1808000000000 implements MigrationInterface {
    name = 'AddExecutionTable1808000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "execution" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "platformId" character varying(21) NOT NULL,
                "userId" character varying(21),
                "status" character varying NOT NULL,
                "prompt" text NOT NULL,
                "metadata" json NOT NULL DEFAULT '{}',
                "tokenUsage" json,
                "cost" numeric,
                "finishTime" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "pk_execution_id" PRIMARY KEY ("id")
            )
        `)

        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_execution_project_id" ON "execution" ("projectId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_execution_platform_id" ON "execution" ("platformId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_execution_status" ON "execution" ("status")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_execution_created" ON "execution" ("created")')

        await queryRunner.query(`
            ALTER TABLE "execution"
            ADD CONSTRAINT "fk_execution_project_id"
            FOREIGN KEY ("projectId") REFERENCES "project"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `)

        await queryRunner.query(`
            ALTER TABLE "execution"
            ADD CONSTRAINT "fk_execution_platform_id"
            FOREIGN KEY ("platformId") REFERENCES "platform"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `)

        await queryRunner.query(`
            ALTER TABLE "execution"
            ADD CONSTRAINT "fk_execution_user_id"
            FOREIGN KEY ("userId") REFERENCES "user"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "execution" DROP CONSTRAINT IF EXISTS "fk_execution_user_id"')
        await queryRunner.query('ALTER TABLE "execution" DROP CONSTRAINT IF EXISTS "fk_execution_platform_id"')
        await queryRunner.query('ALTER TABLE "execution" DROP CONSTRAINT IF EXISTS "fk_execution_project_id"')
        await queryRunner.query('DROP TABLE IF EXISTS "execution"')
    }
}
