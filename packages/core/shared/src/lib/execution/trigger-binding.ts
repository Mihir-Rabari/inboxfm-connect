import { BaseModelSchema, Nullable } from '@inboxfm-connect/core-utils'
import { z } from 'zod'

export enum TriggerBindingStatus {
    ENABLED = 'ENABLED',
    DISABLED = 'DISABLED',
}

export const TriggerBinding = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    platformId: z.string(),
    pieceName: z.string(),
    pieceVersion: z.string(),
    triggerName: z.string(),
    connectionId: Nullable(z.string()),
    promptTemplate: z.string(),
    settings: z.record(z.string(), z.unknown()),
    propertySettings: z.record(z.string(), z.unknown()).optional(),
    status: z.nativeEnum(TriggerBindingStatus),
})

export const CreateTriggerBindingRequest = z.object({
    projectId: z.string().optional(),
    platformId: z.string().optional(),
    pieceName: z.string(),
    pieceVersion: z.string(),
    triggerName: z.string(),
    connectionId: Nullable(z.string()),
    promptTemplate: z.string(),
    settings: z.record(z.string(), z.unknown()),
    propertySettings: z.record(z.string(), z.unknown()).optional(),
    status: z.nativeEnum(TriggerBindingStatus).optional(),
})

export const UpdateTriggerBindingRequest = z.object({
    pieceName: z.string().optional(),
    pieceVersion: z.string().optional(),
    triggerName: z.string().optional(),
    connectionId: Nullable(z.string()),
    promptTemplate: z.string().optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    propertySettings: z.record(z.string(), z.unknown()).optional(),
    status: z.nativeEnum(TriggerBindingStatus).optional(),
})

export type TriggerBinding = z.infer<typeof TriggerBinding>
export type CreateTriggerBindingRequest = z.infer<typeof CreateTriggerBindingRequest>
export type UpdateTriggerBindingRequest = z.infer<typeof UpdateTriggerBindingRequest>
