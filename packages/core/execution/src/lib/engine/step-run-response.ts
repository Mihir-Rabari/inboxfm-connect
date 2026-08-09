import { z } from 'zod'

export const StepRunResponse = z.object({
    runId: z.string(),
    success: z.boolean(),
    input: z.unknown(),
    output: z.unknown(),
    standardError: z.string(),
    standardOutput: z.string(),
})

export type StepRunResponse = z.infer<typeof StepRunResponse>
