import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddScheduledTaskTable1811000000000 implements MigrationInterface {
    name = 'AddScheduledTaskTable1811000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "scheduled_task" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "platformId" character varying(21) NOT NULL,
                "prompt" text NOT NULL,
                "cronExpression" character varying NOT NULL,
                "timezone" character varying NOT NULL DEFAULT 'UTC',
                "status" character varying NOT NULL DEFAULT 'ENABLED',
                "lastRunAt" character varying,
                "nextRunAt" character varying,
                CONSTRAINT "pk_scheduled_task_id" PRIMARY KEY ("id")
            )
        `)

        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_scheduled_task_project_id" ON "scheduled_task" ("projectId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_scheduled_task_platform_id" ON "scheduled_task" ("platformId")')

        await queryRunner.query(`
            ALTER TABLE "scheduled_task"
            ADD CONSTRAINT "fk_scheduled_task_project_id"
            FOREIGN KEY ("projectId") REFERENCES "project"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `)

        await queryRunner.query(`
            ALTER TABLE "scheduled_task"
            ADD CONSTRAINT "fk_scheduled_task_platform_id"
            FOREIGN KEY ("platformId") REFERENCES "platform"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "scheduled_task" DROP CONSTRAINT IF EXISTS "fk_scheduled_task_platform_id"')
        await queryRunner.query('ALTER TABLE "scheduled_task" DROP CONSTRAINT IF EXISTS "fk_scheduled_task_project_id"')
        await queryRunner.query('DROP TABLE IF EXISTS "scheduled_task"')
    }
}
