import { BaseModelSchema } from '@inboxfm-connect/core-utils'
import { z } from 'zod'

export enum ExecutionStatus {
    CREATED = 'CREATED',
    RUNNING = 'RUNNING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
}

const VALID_TRANSITIONS: Record<ExecutionStatus, ExecutionStatus[]> = {
    [ExecutionStatus.CREATED]: [ExecutionStatus.RUNNING, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED],
    [ExecutionStatus.RUNNING]: [ExecutionStatus.COMPLETED, ExecutionStatus.FAILED, ExecutionStatus.CANCELLED],
    [ExecutionStatus.COMPLETED]: [],
    [ExecutionStatus.FAILED]: [],
    [ExecutionStatus.CANCELLED]: [],
}

function isValidExecutionStatusTransition({ from, to }: { from: ExecutionStatus, to: ExecutionStatus }): boolean {
    const allowed = VALID_TRANSITIONS[from]
    return allowed ? allowed.includes(to) : false
}

export const executionUtils = {
    isValidExecutionStatusTransition,
}

export const TokenUsage = z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
})
export type TokenUsage = z.infer<typeof TokenUsage>

export const Execution = z.object({
    ...BaseModelSchema,
    projectId: z.string(),
    platformId: z.string(),
    userId: z.string().nullable().optional(),
    status: z.nativeEnum(ExecutionStatus),
    prompt: z.string(),
    metadata: z.record(z.string(), z.unknown()),
    tokenUsage: TokenUsage.nullable().optional(),
    cost: z.number().nullable().optional(),
    finishTime: z.string().nullable().optional(),
})
export type Execution = z.infer<typeof Execution>
