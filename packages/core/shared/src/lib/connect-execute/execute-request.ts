import { z } from 'zod'

export const ExecuteRequestBody = z.object({
    projectId: z.string().optional(),
    integration: z.string(),
    tool: z.string(),
    connectionId: z.string().optional(),
    externalUserId: z.string().optional(),
    input: z.record(z.string(), z.unknown()),
})

export type ExecuteRequestBody = z.infer<typeof ExecuteRequestBody>
