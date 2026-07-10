import { FlowVersion } from '@inboxfm-connect/shared'
import { flowMigrationUtil } from './flow-migration-util'
import { Migration } from '.'

export const migrateAgentPieceV3: Migration = {
    targetSchemaVersion: '3',
    migrate: async (flowVersion: FlowVersion): Promise<FlowVersion> => {
        const newVersion = flowMigrationUtil.pinPieceToVersion(flowVersion, '@inboxfm-connect/piece-agent', '0.2.2')
        return {
            ...newVersion,
            schemaVersion: '4',
        }
    },
} 