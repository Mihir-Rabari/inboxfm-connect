import { BaseModelSchema } from '@inboxfm-connect/core-utils'
import { z } from 'zod'

export enum ExecutionToolCallStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    SUCCEEDED = 'SUCCEEDED',
    FAILED = 'FAILED',
}

const VALID_TOOL_CALL_TRANSITIONS: Record<ExecutionToolCallStatus, ExecutionToolCallStatus[]> = {
    [ExecutionToolCallStatus.PENDING]: [ExecutionToolCallStatus.RUNNING, ExecutionToolCallStatus.SUCCEEDED, ExecutionToolCallStatus.FAILED],
    [ExecutionToolCallStatus.RUNNING]: [ExecutionToolCallStatus.SUCCEEDED, ExecutionToolCallStatus.FAILED],
    [ExecutionToolCallStatus.SUCCEEDED]: [],
    [ExecutionToolCallStatus.FAILED]: [],
}

function isValidToolCallStatusTransition({ from, to }: { from: ExecutionToolCallStatus; to: ExecutionToolCallStatus }): boolean {
    const allowed = VALID_TOOL_CALL_TRANSITIONS[from]
    return allowed ? allowed.includes(to) : false
}

export const toolCallUtils = {
    isValidToolCallStatusTransition,
}

export const ToolCallError = z.object({
    message: z.string(),
    code: z.string().optional(),
    stack: z.string().optional(),
})
export type ToolCallError = z.infer<typeof ToolCallError>

export const ToolCall = z.object({
    ...BaseModelSchema,
    executionId: z.string(),
    projectId: z.string(),
    pieceName: z.string(),
    pieceVersion: z.string(),
    actionName: z.string(),
    connectionId: z.string().nullable().optional(),
    input: z.record(z.string(), z.unknown()),
    output: z.unknown().nullable().optional(),
    status: z.nativeEnum(ExecutionToolCallStatus),
    error: ToolCallError.nullable().optional(),
    latencyMs: z.number().nullable().optional(),
    finished: z.string().nullable().optional(),
})
export type ToolCall = z.infer<typeof ToolCall>
