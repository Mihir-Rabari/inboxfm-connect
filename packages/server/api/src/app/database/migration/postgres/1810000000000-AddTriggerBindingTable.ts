import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddTriggerBindingTable1810000000000 implements MigrationInterface {
    name = 'AddTriggerBindingTable1810000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "trigger_binding" (
                "id" character varying(21) NOT NULL,
                "created" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "projectId" character varying(21) NOT NULL,
                "platformId" character varying(21) NOT NULL,
                "pieceName" character varying NOT NULL,
                "pieceVersion" character varying NOT NULL,
                "triggerName" character varying NOT NULL,
                "connectionId" character varying(21),
                "promptTemplate" text NOT NULL,
                "settings" json NOT NULL DEFAULT '{}',
                "propertySettings" json,
                "status" character varying NOT NULL DEFAULT 'ENABLED',
                CONSTRAINT "pk_trigger_binding_id" PRIMARY KEY ("id")
            )
        `)

        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_trigger_binding_project_id" ON "trigger_binding" ("projectId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_trigger_binding_platform_id" ON "trigger_binding" ("platformId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_trigger_binding_connection_id" ON "trigger_binding" ("connectionId")')
        await queryRunner.query('CREATE INDEX IF NOT EXISTS "idx_trigger_binding_piece_trigger" ON "trigger_binding" ("pieceName", "triggerName")')

        await queryRunner.query(`
            ALTER TABLE "trigger_binding"
            ADD CONSTRAINT "fk_trigger_binding_project_id"
            FOREIGN KEY ("projectId") REFERENCES "project"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `)

        await queryRunner.query(`
            ALTER TABLE "trigger_binding"
            ADD CONSTRAINT "fk_trigger_binding_platform_id"
            FOREIGN KEY ("platformId") REFERENCES "platform"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION
        `)

        await queryRunner.query(`
            ALTER TABLE "trigger_binding"
            ADD CONSTRAINT "fk_trigger_binding_connection_id"
            FOREIGN KEY ("connectionId") REFERENCES "app_connection"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "trigger_binding" DROP CONSTRAINT IF EXISTS "fk_trigger_binding_connection_id"')
        await queryRunner.query('ALTER TABLE "trigger_binding" DROP CONSTRAINT IF EXISTS "fk_trigger_binding_platform_id"')
        await queryRunner.query('ALTER TABLE "trigger_binding" DROP CONSTRAINT IF EXISTS "fk_trigger_binding_project_id"')
        await queryRunner.query('DROP TABLE IF EXISTS "trigger_binding"')
    }
}
