import { faker } from '@faker-js/faker'
import { apId } from '@inboxfm-connect/core-utils'
import { Field, FieldState, FieldType, PopulatedTable, TableAutomationStatus } from '@inboxfm-connect/shared'

export const tableGenerator = {
    simpleTable(table: Partial<PopulatedTable>): PopulatedTable {
        const tableId = apId()
        return {
            id: tableId,
            name: faker.lorem.word(),
            externalId: table.externalId ?? apId(),
            fields: table.fields ?? [
                tableGenerator.generateRandomField(tableId, 0),
                tableGenerator.generateRandomField(tableId, 1),
            ],
            projectId: apId(),
            created: faker.date.recent().toISOString(),
            updated: faker.date.recent().toISOString(),
            status: table.status ?? TableAutomationStatus.ENABLED,
            trigger: table.trigger ?? null,
        }
    },
    generateRandomField(tableId: string, position = 0): Field {
        return {
            id: apId(),
            projectId: apId(),
            created: faker.date.recent().toISOString(),
            updated: faker.date.recent().toISOString(),
            tableId,
            name: faker.lorem.word(),
            type: FieldType.TEXT,
            externalId: apId(),
            position,
        }
    },
    generateRandomDropdownField(): FieldState {
        return {
            name: faker.lorem.word(),
            type: FieldType.STATIC_DROPDOWN,
            externalId: apId(),
            data: {
                options: [
                    { value: faker.lorem.word() },
                    { value: faker.lorem.word() },
                ],
            },
        }
    },
} 