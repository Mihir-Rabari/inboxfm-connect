import { AppConnection, Platform, Project, TriggerBinding } from '@inboxfm-connect/shared'
import { EntitySchema } from 'typeorm'
import { ApIdSchema, BaseColumnSchemaPart } from '../../database/database-common'

export const TriggerBindingEntity = new EntitySchema<TriggerBindingSchema>({
    name: 'trigger_binding',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: {
            ...ApIdSchema,
            nullable: false,
        },
        platformId: {
            ...ApIdSchema,
            nullable: false,
        },
        pieceName: {
            type: String,
            nullable: false,
        },
        pieceVersion: {
            type: String,
            nullable: false,
        },
        triggerName: {
            type: String,
            nullable: false,
        },
        connectionId: {
            ...ApIdSchema,
            nullable: true,
        },
        promptTemplate: {
            type: String,
            nullable: false,
        },
        settings: {
            type: 'json',
            nullable: false,
        },
        propertySettings: {
            type: 'json',
            nullable: true,
        },
        status: {
            type: String,
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_trigger_binding_project_id',
            columns: ['projectId'],
        },
        {
            name: 'idx_trigger_binding_platform_id',
            columns: ['platformId'],
        },
        {
            name: 'idx_trigger_binding_connection_id',
            columns: ['connectionId'],
        },
        {
            name: 'idx_trigger_binding_piece_trigger',
            columns: ['pieceName', 'triggerName'],
        },
    ],
    relations: {
        project: {
            type: 'many-to-one',
            target: 'project',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'projectId',
                foreignKeyConstraintName: 'fk_trigger_binding_project_id',
            },
        },
        platform: {
            type: 'many-to-one',
            target: 'platform',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'platformId',
                foreignKeyConstraintName: 'fk_trigger_binding_platform_id',
            },
        },
        connection: {
            type: 'many-to-one',
            target: 'app_connection',
            cascade: true,
            onDelete: 'SET NULL',
            joinColumn: {
                name: 'connectionId',
                foreignKeyConstraintName: 'fk_trigger_binding_connection_id',
            },
        },
    },
})

export type TriggerBindingSchema = TriggerBinding & {
    project: Project
    platform: Platform
    connection?: AppConnection | null
}
