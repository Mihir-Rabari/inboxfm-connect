import { ApId, BaseModelSchema, formErrors, isNil, Nullable } from '@inboxfm-connect/core-utils'
import { z } from 'zod'

export const ApiKey = z.object({
    ...BaseModelSchema,
    platformId: ApId,
    displayName: z.string(),
    hashedValue: z.string(),
    truncatedValue: z.string(),
    lastUsedAt: Nullable(z.string()),
    expiresAt: Nullable(z.string()),
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
    expiresAt: z.string().optional(),
}).refine((request) => isApiKeyExpiryValid(request.expiresAt), {
    message: formErrors.apiKeyExpiryMustBeFuture,
    path: ['expiresAt'],
})

export type CreateApiKeyRequest = z.infer<typeof CreateApiKeyRequest>

export function isApiKeyExpiryValid(expiresAt: string | undefined): boolean {
    if (isNil(expiresAt)) {
        return true
    }
    const parsed = new Date(expiresAt).getTime()
    return !Number.isNaN(parsed) && parsed > Date.now()
}

