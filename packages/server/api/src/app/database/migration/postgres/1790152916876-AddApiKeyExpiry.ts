import { QueryRunner } from 'typeorm'
import { Migration } from '../../migration'

export class AddApiKeyExpiry1790152916876 implements Migration {
    name = 'AddApiKeyExpiry1790152916876'
    breaking = false
    release = '0.87.0'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "connect_api_key"
            ADD "expiresAt" character varying
        `)
        await queryRunner.query(`
            ALTER TABLE "api_key"
            ADD "expiresAt" character varying
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "api_key" DROP COLUMN "expiresAt"
        `)
        await queryRunner.query(`
            ALTER TABLE "connect_api_key" DROP COLUMN "expiresAt"
        `)
    }

}
