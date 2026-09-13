import { ApId, BaseModelSchema, Nullable } from '@inboxfm-connect/core-utils'
import { z } from 'zod'

export const ConnectApiKey = z.object({
    ...BaseModelSchema,
    platformId: ApId,
    projectId: ApId,
    displayName: z.string(),
    hashedValue: z.string(),
    truncatedValue: z.string(),
    lastUsedAt: Nullable(z.string()),
})

export type ConnectApiKey = z.infer<typeof ConnectApiKey>

export const ConnectApiKeyResponseWithValue = ConnectApiKey.omit({ hashedValue: true }).extend({
    value: z.string(),
})

export type ConnectApiKeyResponseWithValue = z.infer<typeof ConnectApiKeyResponseWithValue>

export const ConnectApiKeyResponseWithoutValue = ConnectApiKey.omit({ hashedValue: true })

export type ConnectApiKeyResponseWithoutValue = z.infer<typeof ConnectApiKeyResponseWithoutValue>

export const CreateConnectApiKeyRequest = z.object({
    displayName: z.string(),
    projectId: ApId,
})

export type CreateConnectApiKeyRequest = z.infer<typeof CreateConnectApiKeyRequest>
