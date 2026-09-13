import { ConnectApiKey, Platform, Project } from '@inboxfm-connect/shared'
import { EntitySchema } from 'typeorm'
import {
    ApIdSchema,
    BaseColumnSchemaPart,
} from '../database/database-common'

type ConnectApiKeySchema = ConnectApiKey & {
    platform?: Platform
    project?: Project
}

export const ConnectApiKeyEntity = new EntitySchema<ConnectApiKeySchema>({
    name: 'connect_api_key',
    columns: {
        ...BaseColumnSchemaPart,
        displayName: {
            type: String,
            nullable: false,
        },
        platformId: {
            ...ApIdSchema,
            nullable: false,
        },
        projectId: {
            ...ApIdSchema,
            nullable: false,
        },
        hashedValue: {
            type: String,
            nullable: false,
        },
        truncatedValue: {
            type: String,
            nullable: false,
        },
        lastUsedAt: {
            type: String,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_connect_api_key_project_id',
            columns: ['projectId'],
        },
    ],
    relations: {
        platform: {
            type: 'many-to-one',
            target: 'platform',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'platformId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_connect_api_key_platform_id',
            },
        },
        project: {
            type: 'many-to-one',
            target: 'project',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_connect_api_key_project_id',
            },
        },
    },
})
