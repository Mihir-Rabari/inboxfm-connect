import { isNil } from '@inboxfm-connect/core-utils'
import { FlowVersion } from '@inboxfm-connect/shared'
import { Migration } from '.'

export const migrateV13AddNotes: Migration = {
    targetSchemaVersion: '13',
    migrate: async (flowVersion: FlowVersion): Promise<FlowVersion> => {
        return {
            ...flowVersion,
            notes: isNil(flowVersion.notes) ? [] : flowVersion.notes,
            schemaVersion: '14',
        }
    },
}

