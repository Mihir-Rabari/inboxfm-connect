import { z } from 'zod'

export enum ConnectionHealthStatus {
    HEALTHY = 'healthy',
    UNHEALTHY = 'unhealthy',
    ERROR = 'error',
}

export const TestConnectionResponse = z.object({
    success: z.boolean(),
    status: z.nativeEnum(ConnectionHealthStatus),
    message: z.string(),
    testedAt: z.string(),
    responseTimeMs: z.number().nonnegative(),
})

export type TestConnectionResponse = z.infer<typeof TestConnectionResponse>
