import { Platform, Project, ScheduledTask } from '@inboxfm-connect/shared'
import { EntitySchema } from 'typeorm'
import { ApIdSchema, BaseColumnSchemaPart } from '../../database/database-common'

export const ScheduledTaskEntity = new EntitySchema<ScheduledTaskSchema>({
    name: 'scheduled_task',
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
        prompt: {
            type: String,
            nullable: false,
        },
        cronExpression: {
            type: String,
            nullable: false,
        },
        timezone: {
            type: String,
            default: 'UTC',
            nullable: false,
        },
        status: {
            type: String,
            nullable: false,
        },
        lastRunAt: {
            type: String,
            nullable: true,
        },
        nextRunAt: {
            type: String,
            nullable: true,
        },
    },
    indices: [
        {
            name: 'idx_scheduled_task_project_id',
            columns: ['projectId'],
        },
        {
            name: 'idx_scheduled_task_platform_id',
            columns: ['platformId'],
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
                foreignKeyConstraintName: 'fk_scheduled_task_project_id',
            },
        },
        platform: {
            type: 'many-to-one',
            target: 'platform',
            cascade: true,
            onDelete: 'CASCADE',
            joinColumn: {
                name: 'platformId',
                foreignKeyConstraintName: 'fk_scheduled_task_platform_id',
            },
        },
    },
})

export type ScheduledTaskSchema = ScheduledTask & {
    project: Project
    platform: Platform
}
