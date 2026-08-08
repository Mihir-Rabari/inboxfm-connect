import { ExecutionToolCallStatus, ToolCall, toolCallUtils } from '@inboxfm-connect/shared'
import { describe, expect, it } from 'vitest'

describe('ToolCall Ledger & Transition Logic', () => {
    describe('toolCallUtils.isValidToolCallStatusTransition', () => {
        it('allows PENDING -> RUNNING', () => {
            const valid = toolCallUtils.isValidToolCallStatusTransition({
                from: ExecutionToolCallStatus.PENDING,
                to: ExecutionToolCallStatus.RUNNING,
            })
            expect(valid).toBe(true)
        })

        it('allows PENDING -> SUCCEEDED', () => {
            const valid = toolCallUtils.isValidToolCallStatusTransition({
                from: ExecutionToolCallStatus.PENDING,
                to: ExecutionToolCallStatus.SUCCEEDED,
            })
            expect(valid).toBe(true)
        })

        it('allows PENDING -> FAILED', () => {
            const valid = toolCallUtils.isValidToolCallStatusTransition({
                from: ExecutionToolCallStatus.PENDING,
                to: ExecutionToolCallStatus.FAILED,
            })
            expect(valid).toBe(true)
        })

        it('allows RUNNING -> SUCCEEDED', () => {
            const valid = toolCallUtils.isValidToolCallStatusTransition({
                from: ExecutionToolCallStatus.RUNNING,
                to: ExecutionToolCallStatus.SUCCEEDED,
            })
            expect(valid).toBe(true)
        })

        it('allows RUNNING -> FAILED', () => {
            const valid = toolCallUtils.isValidToolCallStatusTransition({
                from: ExecutionToolCallStatus.RUNNING,
                to: ExecutionToolCallStatus.FAILED,
            })
            expect(valid).toBe(true)
        })

        it('rejects SUCCEEDED -> RUNNING (terminal state)', () => {
            const valid = toolCallUtils.isValidToolCallStatusTransition({
                from: ExecutionToolCallStatus.SUCCEEDED,
                to: ExecutionToolCallStatus.RUNNING,
            })
            expect(valid).toBe(false)
        })

        it('rejects FAILED -> RUNNING (terminal state)', () => {
            const valid = toolCallUtils.isValidToolCallStatusTransition({
                from: ExecutionToolCallStatus.FAILED,
                to: ExecutionToolCallStatus.RUNNING,
            })
            expect(valid).toBe(false)
        })

        it('rejects SUCCEEDED -> FAILED', () => {
            const valid = toolCallUtils.isValidToolCallStatusTransition({
                from: ExecutionToolCallStatus.SUCCEEDED,
                to: ExecutionToolCallStatus.FAILED,
            })
            expect(valid).toBe(false)
        })

        it('rejects FAILED -> SUCCEEDED', () => {
            const valid = toolCallUtils.isValidToolCallStatusTransition({
                from: ExecutionToolCallStatus.FAILED,
                to: ExecutionToolCallStatus.SUCCEEDED,
            })
            expect(valid).toBe(false)
        })
    })

    describe('Forbidden Graph Fields Audit', () => {
        it('ensures ToolCall schema contains zero graph/workflow fields', () => {
            const keys = Object.keys(ToolCall.shape)
            const forbiddenKeys = [
                'flowId',
                'flowVersionId',
                'flowRunId',
                'stepName',
                'stepIndex',
                'nodeId',
                'routerPath',
                'loopIteration',
            ]

            for (const forbiddenKey of forbiddenKeys) {
                expect(keys).not.toContain(forbiddenKey)
            }
        })
    })
})
