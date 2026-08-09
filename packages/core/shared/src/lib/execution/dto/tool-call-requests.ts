import { z } from 'zod'
import { ExecutionToolCallStatus, ToolCall, ToolCallError } from '../tool-call'

export const CreateToolCallRequestBody = z.object({
    executionId: z.string(),
    projectId: z.string(),
    pieceName: z.string(),
    pieceVersion: z.string(),
    actionName: z.string(),
    connectionId: z.string().nullable().optional(),
    input: z.record(z.string(), z.unknown()),
})
export type CreateToolCallRequestBody = z.infer<typeof CreateToolCallRequestBody>

export const MarkToolCallRunningRequestBody = z.object({
    id: z.string(),
    executionId: z.string(),
    projectId: z.string(),
})
export type MarkToolCallRunningRequestBody = z.infer<typeof MarkToolCallRunningRequestBody>

export const MarkToolCallSucceededRequestBody = z.object({
    id: z.string(),
    executionId: z.string(),
    projectId: z.string(),
    output: z.unknown(),
    latencyMs: z.number().nonnegative(),
})
export type MarkToolCallSucceededRequestBody = z.infer<typeof MarkToolCallSucceededRequestBody>

export const MarkToolCallFailedRequestBody = z.object({
    id: z.string(),
    executionId: z.string(),
    projectId: z.string(),
    error: ToolCallError,
    latencyMs: z.number().nonnegative(),
})
export type MarkToolCallFailedRequestBody = z.infer<typeof MarkToolCallFailedRequestBody>

export const ListToolCallsRequestParams = z.object({
    id: z.string(),
})
export type ListToolCallsRequestParams = z.infer<typeof ListToolCallsRequestParams>
