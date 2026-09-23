import { ApId, BaseModelSchema, formErrors, Nullable } from '@inboxfm-connect/core-utils'
import { z } from 'zod'
import { isApiKeyExpiryValid } from '../ee/api-key'

export const ConnectApiKey = z.object({
    ...BaseModelSchema,
    platformId: ApId,
    projectId: ApId,
    displayName: z.string(),
    hashedValue: z.string(),
    truncatedValue: z.string(),
    lastUsedAt: Nullable(z.string()),
    expiresAt: Nullable(z.string()),
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
    expiresAt: z.string().optional(),
}).refine((request) => isApiKeyExpiryValid(request.expiresAt), {
    message: formErrors.apiKeyExpiryMustBeFuture,
    path: ['expiresAt'],
})

export type CreateConnectApiKeyRequest = z.infer<typeof CreateConnectApiKeyRequest>
