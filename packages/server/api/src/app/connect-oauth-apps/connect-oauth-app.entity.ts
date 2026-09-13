import { ConnectOAuthApp, Platform } from '@inboxfm-connect/shared'
import { EntitySchema } from 'typeorm'
import { ApIdSchema, BaseColumnSchemaPart } from '../database/database-common'
import { EncryptedObject } from '../helper/encryption'

type ConnectOAuthAppSchema = ConnectOAuthApp & {
    platform?: Platform
    clientSecret: EncryptedObject
}

export type ConnectOAuthAppWithSecret = ConnectOAuthApp & { clientSecret: string }
export type ConnectOAuthAppWithEncryptedSecret = ConnectOAuthApp & { clientSecret: EncryptedObject }

export const ConnectOAuthAppEntity = new EntitySchema<ConnectOAuthAppSchema>({
    name: 'connect_oauth_app',
    columns: {
        ...BaseColumnSchemaPart,
        platformId: {
            ...ApIdSchema,
            nullable: false,
        },
        pieceName: {
            type: String,
            nullable: false,
        },
        clientId: {
            type: String,
            nullable: false,
        },
        clientSecret: {
            type: 'jsonb',
            nullable: false,
        },
    },
    indices: [
        {
            name: 'idx_connect_oauth_app_platform_id_piece_name',
            columns: ['platformId', 'pieceName'],
            unique: true,
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
                foreignKeyConstraintName: 'fk_connect_oauth_app_platform_id',
            },
        },
    },
})
