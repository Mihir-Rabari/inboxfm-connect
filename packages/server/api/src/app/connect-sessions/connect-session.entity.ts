import { ConnectSession, Project } from '@inboxfm-connect/shared'
import { EntitySchema } from 'typeorm'
import {
    ApIdSchema,
    BaseColumnSchemaPart,
} from '../database/database-common'

type ConnectSessionSchema = ConnectSession & {
    project?: Project
}

export const ConnectSessionEntity = new EntitySchema<ConnectSessionSchema>({
    name: 'connect_session',
    columns: {
        ...BaseColumnSchemaPart,
        projectId: {
            ...ApIdSchema,
            nullable: false,
        },
        externalUserId: {
            type: String,
            nullable: false,
        },
        allowedPieceNames: {
            type: String,
            array: true,
            nullable: true,
        },
        hashedToken: {
            type: String,
            nullable: false,
        },
        truncatedToken: {
            type: String,
            nullable: false,
        },
        expiresAt: {
            type: String,
            nullable: false,
        },
        consumedAt: {
            type: String,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_connect_session_project_id_external_user_id',
            columns: ['projectId', 'externalUserId'],
        },
        {
            name: 'idx_connect_session_hashed_token',
            columns: ['hashedToken'],
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
                referencedColumnName: 'id',
                foreignKeyConstraintName: 'fk_connect_session_project_id',
            },
        },
    },
})
