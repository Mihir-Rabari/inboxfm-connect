import { ApId, BaseModelSchema, Nullable } from '@inboxfm-connect/core-utils'
import { z } from 'zod'

export const ApiKey = z.object({
    ...BaseModelSchema,
    platformId: ApId,
    projectId: Nullable(ApId),
    displayName: z.string(),
    hashedValue: z.string(),
    truncatedValue: z.string(),
    lastUsedAt: Nullable(z.string()),
})

export type ApiKey = z.infer<typeof ApiKey>

export const ApiKeyResponseWithValue = ApiKey.omit({ hashedValue: true }).extend({
    value: z.string(),
})

export type ApiKeyResponseWithValue = z.infer<typeof ApiKeyResponseWithValue>


export const ApiKeyResponseWithoutValue = ApiKey.omit({ hashedValue: true })

export type ApiKeyResponseWithoutValue = z.infer<typeof ApiKeyResponseWithoutValue>


export const CreateApiKeyRequest = z.object({
    displayName: z.string(),
})

export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequest>


export const CreateProjectApiKeyRequest = z.object({
    displayName: z.string(),
    projectId: ApId,
})

export type CreateProjectApiKeyRequest = z.infer<typeof CreateProjectApiKeyRequest>

