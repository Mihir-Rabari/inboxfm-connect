import { z } from 'zod'
import { AppConnectionWithoutSensitiveData } from '../app-connection'

export const TestConnectionResponse = z.object({
    status: z.enum(['PASS', 'FAIL']),
    valid: z.boolean(),
    message: z.string(),
    error: z.string().optional(),
    testedAt: z.string(),
    connection: AppConnectionWithoutSensitiveData,
})

export type TestConnectionResponse = z.infer<typeof TestConnectionResponse>
