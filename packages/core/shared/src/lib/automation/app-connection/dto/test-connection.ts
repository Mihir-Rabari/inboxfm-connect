import { z } from 'zod'

export enum ConnectionHealthStatus {
    HEALTHY = 'HEALTHY',
    AUTH_EXPIRED = 'AUTH_EXPIRED',
    AUTH_INVALID = 'AUTH_INVALID',
    INSUFFICIENT_PERMISSION = 'INSUFFICIENT_PERMISSION',
    RATE_LIMITED = 'RATE_LIMITED',
    PROVIDER_ERROR = 'PROVIDER_ERROR',
    NETWORK_ERROR = 'NETWORK_ERROR',
}

export const TestConnectionResponse = z.object({
    success: z.boolean(),
    status: z.enum(ConnectionHealthStatus),
    message: z.string(),
    testedAt: z.string(),
    responseTimeMs: z.number().nonnegative(),
})

export type TestConnectionResponse = z.infer<typeof TestConnectionResponse>

