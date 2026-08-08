import { z } from 'zod'
import { ExecutionStatus, TokenUsage } from '../execution'

export const CreateExecutionRequestBody = z.object({
    projectId: z.string().optional(),
    prompt: z.string().min(1),
    connectionIds: z.array(z.string()).optional().default([]),
    metadata: z.record(z.string(), z.unknown()).optional().default({}),
})
export type CreateExecutionRequestBody = z.infer<typeof CreateExecutionRequestBody>

export const ExecutionResult = z.object({
    executionId: z.string(),
    status: z.nativeEnum(ExecutionStatus),
    output: z.unknown().optional(),
    error: z.object({
        message: z.string(),
        code: z.string().optional(),
    }).nullable().optional(),
    tokenUsage: TokenUsage.nullable().optional(),
    durationMs: z.number().nullable().optional(),
})
export type ExecutionResult = z.infer<typeof ExecutionResult>

export const ListExecutionsRequestQuery = z.object({
    projectId: z.string().optional(),
    status: z.nativeEnum(ExecutionStatus).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(10),
    cursor: z.string().optional(),
})
export type ListExecutionsRequestQuery = z.infer<typeof ListExecutionsRequestQuery>
