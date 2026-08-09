import { MigrationInterface, QueryRunner } from 'typeorm'

export class DropWorkflowTablesSqlite1807000000000 implements MigrationInterface {
    name = 'DropWorkflowTablesSqlite1807000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP TABLE IF EXISTS "waitpoint"')
        await queryRunner.query('DROP TABLE IF EXISTS "trigger_event"')
        await queryRunner.query('DROP TABLE IF EXISTS "trigger_source"')
        await queryRunner.query('DROP TABLE IF EXISTS "flow_run"')
        await queryRunner.query('DROP TABLE IF EXISTS "flow_version"')
        await queryRunner.query('DROP TABLE IF EXISTS "flow"')
        await queryRunner.query('DROP TABLE IF EXISTS "folder"')
        await queryRunner.query('DROP TABLE IF EXISTS "app_event_routing"')
        await queryRunner.query('DROP TABLE IF EXISTS "git_repo"')
        await queryRunner.query('DROP TABLE IF EXISTS "project_release"')
        await queryRunner.query('DROP TABLE IF EXISTS "template"')
        await queryRunner.query('DROP TABLE IF EXISTS "table_webhook"')

        try {
            await queryRunner.query('ALTER TABLE "mcp_tool" DROP COLUMN "flowId"')
        }
        catch (e) {
            // SQLite version might not support DROP COLUMN
        }
    }

    public async down(_queryRunner: QueryRunner): Promise<void> {
        // Drop migration has no down action as workflows are dropped permanently
    }
}
