import { ApId, BaseModelSchema } from '@inboxfm-connect/core-utils'
import { z } from 'zod'

export const ConnectOAuthApp = z.object({
    ...BaseModelSchema,
    platformId: ApId,
    pieceName: z.string(),
    clientId: z.string(),
})

export type ConnectOAuthApp = z.infer<typeof ConnectOAuthApp>

export const UpsertConnectOAuthAppRequest = z.object({
    pieceName: z.string(),
    clientId: z.string(),
    clientSecret: z.string(),
})

export type UpsertConnectOAuthAppRequest = z.infer<typeof UpsertConnectOAuthAppRequest>
