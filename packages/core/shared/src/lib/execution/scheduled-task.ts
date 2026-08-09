import { BaseModelSchema, Nullable } from '@inboxfm-connect/core-utils'
import { z } from 'zod'

export enum ScheduledTaskStatus {
    ENABLED = 'ENABLED',
    DISABLED = 'DISABLED',
}

export const ScheduledTask = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    platformId: z.string(),
    prompt: z.string(),
    cronExpression: z.string(),
    timezone: z.string().default('UTC'),
    status: z.enum(['ENABLED', 'DISABLED']),
    lastRunAt: Nullable(z.string()),
    nextRunAt: Nullable(z.string()),
})

export const CreateScheduledTaskRequest = z.object({
    projectId: z.string().optional(),
    platformId: z.string().optional(),
    prompt: z.string(),
    cronExpression: z.string(),
    timezone: z.string().optional(),
    status: z.enum(['ENABLED', 'DISABLED']).optional(),
})

export const UpdateScheduledTaskRequest = z.object({
    prompt: z.string().optional(),
    cronExpression: z.string().optional(),
    timezone: z.string().optional(),
    status: z.enum(['ENABLED', 'DISABLED']).optional(),
})

export type ScheduledTask = z.infer<typeof ScheduledTask>
export type CreateScheduledTaskRequest = z.infer<typeof CreateScheduledTaskRequest>
export type UpdateScheduledTaskRequest = z.infer<typeof UpdateScheduledTaskRequest>
