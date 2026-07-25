import {
    AppConnection,
    Cell,
    ConcurrencyPool,
    Field,
    File,
    Platform,
    Project,
    Record,
    Table,
    User,
} from '@inboxfm-connect/shared'
import { EntitySchema } from 'typeorm'
import {
    ApIdSchema,
    BaseColumnSchemaPart,
} from '../database/database-common'

type ProjectSchema = Project & {
    owner: User
    files: File[]
    appConnections: AppConnection[]
    platform: Platform
    tables: Table[]
    fields: Field[]
    records: Record[]
    cells: Cell[]
    pool?: ConcurrencyPool | null
}

export const ProjectEntity = new EntitySchema<ProjectSchema>({
    name: 'project',
    columns: {
        ...BaseColumnSchemaPart,
        deleted: {
            type: 'timestamp with time zone',
            deleteDate: true,
            nullable: true,
        },
        ownerId: ApIdSchema,
        displayName: {
            type: String,
        },
        type: {
            type: String,
            nullable: false,
        },
        platformId: {
            ...ApIdSchema,
        },
        externalId: {
            type: String,
            nullable: true,
        },
        maxConcurrentJobs: {
            type: Number,
            nullable: true,
        },
        icon: {
            type: 'jsonb',
            nullable: false,
        },
        releasesEnabled: {
            type: Boolean,
            nullable: false,
            default: false,
        },
        metadata: {
            type: 'jsonb',
            nullable: true,
        },
        poolId: {
            ...ApIdSchema,
            nullable: true,
        },
        workerGroupId: {
            type: String,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_project_owner_id',
            columns: ['ownerId'],
            unique: false,
        },
        {
            name: 'idx_project_platform_id_external_id',
            columns: ['platformId', 'externalId'],
            where: 'deleted IS NULL',
            unique: true,
        },
        {
            name: 'idx_project_platform_id',
            columns: ['platformId'],
            unique: false,
        },
        {
            name: 'idx_project_pool_id',
            columns: ['poolId'],
            unique: false,
        },
        {
            name: 'idx_project_worker_group',
            columns: ['workerGroupId'],
            unique: false,
        },
    ],
    relations: {
        owner: {
            type: 'many-to-one',
            target: 'user',
            joinColumn: {
                name: 'ownerId',
                foreignKeyConstraintName: 'fk_project_owner_id',
            },
        },
        platform: {
            type: 'many-to-one',
            target: 'platform',
            cascade: true,
            onDelete: 'RESTRICT',
            onUpdate: 'RESTRICT',
            joinColumn: {
                name: 'platformId',
                foreignKeyConstraintName: 'fk_project_platform_id',
            },
        },
        appConnections: {
            type: 'one-to-many',
            target: 'app_connection',
            inverseSide: 'project',
        },
        files: {
            type: 'one-to-many',
            target: 'file',
            inverseSide: 'project',
        },
        tables: {
            type: 'one-to-many',
            target: 'table',
            inverseSide: 'project',
        },
        fields: {
            type: 'one-to-many',
            target: 'field',
            inverseSide: 'project',
        },
        records: {
            type: 'one-to-many',
            target: 'record',
            inverseSide: 'project',
        },
        cells: {
            type: 'one-to-many',
            target: 'cell',
            inverseSide: 'project',
        },
        pool: {
            type: 'many-to-one',
            target: 'concurrency_pool',
            onDelete: 'SET NULL',
            nullable: true,
            joinColumn: {
                name: 'poolId',
                foreignKeyConstraintName: 'fk_project_pool_id',
            },
        },
    },
})
