import { MigrationInterface, QueryRunner } from 'typeorm'

export class DropWorkflowTables1807000000000 implements MigrationInterface {
    name = 'DropWorkflowTables1807000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('ALTER TABLE "mcp_tool" DROP CONSTRAINT IF EXISTS "FK_3f26c7b876fba48b9e90efb3d79"')
        await queryRunner.query('ALTER TABLE "flow" DROP CONSTRAINT IF EXISTS "fk_flow_published_version"')

        await queryRunner.query('DROP TABLE IF EXISTS "waitpoint" CASCADE')
        await queryRunner.query('DROP TABLE IF EXISTS "trigger_event" CASCADE')
        await queryRunner.query('DROP TABLE IF EXISTS "trigger_source" CASCADE')
        await queryRunner.query('DROP TABLE IF EXISTS "flow_run" CASCADE')
        await queryRunner.query('DROP TABLE IF EXISTS "flow_version" CASCADE')
        await queryRunner.query('DROP TABLE IF EXISTS "flow" CASCADE')
        await queryRunner.query('DROP TABLE IF EXISTS "folder" CASCADE')
        await queryRunner.query('DROP TABLE IF EXISTS "app_event_routing" CASCADE')
        await queryRunner.query('DROP TABLE IF EXISTS "git_repo" CASCADE')
        await queryRunner.query('DROP TABLE IF EXISTS "project_release" CASCADE')
        await queryRunner.query('DROP TABLE IF EXISTS "template" CASCADE')
        await queryRunner.query('DROP TABLE IF EXISTS "table_webhook" CASCADE')

        await queryRunner.query('ALTER TABLE "mcp_tool" DROP COLUMN IF EXISTS "flowId"')
    }

    public async down(_queryRunner: QueryRunner): Promise<void> {
        // Drop migration has no down action as workflows are dropped permanently
    }
}
