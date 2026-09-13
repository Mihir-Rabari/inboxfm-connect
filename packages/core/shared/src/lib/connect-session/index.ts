import { ApId, BaseModelSchema, Nullable } from '@inboxfm-connect/core-utils'
import { z } from 'zod'

export const ConnectSession = z.object({
    ...BaseModelSchema,
    projectId: ApId,
    externalUserId: z.string(),
    allowedPieceNames: Nullable(z.array(z.string())),
    hashedToken: z.string(),
    truncatedToken: z.string(),
    expiresAt: z.string(),
    consumedAt: Nullable(z.string()),
})

export type ConnectSession = z.infer<typeof ConnectSession>

export const CreateConnectSessionRequest = z.object({
    projectId: ApId,
    externalUserId: z.string().min(1),
    allowedPieceNames: z.array(z.string()).optional(),
    expiresInSeconds: z.number().int().positive().max(3600).optional(),
})

export type CreateConnectSessionRequest = z.infer<typeof CreateConnectSessionRequest>

export const CreateConnectSessionResponse = z.object({
    token: z.string(),
    connectUrl: z.string(),
    expiresAt: z.string(),
})

export type CreateConnectSessionResponse = z.infer<typeof CreateConnectSessionResponse>

export const ConnectSessionPublicInfo = z.object({
    projectId: ApId,
    externalUserId: z.string(),
    allowedPieceNames: Nullable(z.array(z.string())),
    expiresAt: z.string(),
})

export type ConnectSessionPublicInfo = z.infer<typeof ConnectSessionPublicInfo>
