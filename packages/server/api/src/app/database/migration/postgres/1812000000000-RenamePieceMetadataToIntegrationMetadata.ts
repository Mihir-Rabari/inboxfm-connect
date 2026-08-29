import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * `PieceMetadataEntity` was renamed to `IntegrationMetadataEntity` and its
 * `EntitySchema.name` changed from `piece_metadata` to `integration_metadata`, but no
 * migration ever followed. On a migrated database the relation was still called
 * `piece_metadata`, so `GET /v1/integrations` — the console's integration catalog —
 * failed with `relation "integration_metadata" does not exist`.
 *
 * A rename, not a create: the table holds the synced integration catalog and must keep
 * its rows. The entity also deliberately retains the original index and foreign-key
 * names (`idx_piece_metadata_name_platform_id_version`, `fk_piece_metadata_file`), and
 * `ALTER TABLE ... RENAME TO` carries them over unchanged, so no index rework is needed.
 *
 * Guarded on both sides so it is a no-op on a database that was created by
 * `synchronize` (which already produced `integration_metadata`).
 */
export class RenamePieceMetadataToIntegrationMetadata1812000000000 implements MigrationInterface {
    name = 'RenamePieceMetadataToIntegrationMetadata1812000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasLegacy = await queryRunner.hasTable('piece_metadata')
        const hasRenamed = await queryRunner.hasTable('integration_metadata')

        if (hasLegacy && !hasRenamed) {
            await queryRunner.query('ALTER TABLE "piece_metadata" RENAME TO "integration_metadata"')
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const hasLegacy = await queryRunner.hasTable('piece_metadata')
        const hasRenamed = await queryRunner.hasTable('integration_metadata')

        if (hasRenamed && !hasLegacy) {
            await queryRunner.query('ALTER TABLE "integration_metadata" RENAME TO "piece_metadata"')
        }
    }
}
