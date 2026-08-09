import { ExecutionStatus, executionUtils } from '@inboxfm-connect/shared'
import { describe, expect, it } from 'vitest'

describe('Execution Service Domain Logic', () => {
    describe('executionUtils.isValidExecutionStatusTransition', () => {
        it('allows CREATED -> RUNNING', () => {
            const valid = executionUtils.isValidExecutionStatusTransition({
                from: ExecutionStatus.CREATED,
                to: ExecutionStatus.RUNNING,
            })
            expect(valid).toBe(true)
        })

        it('allows RUNNING -> COMPLETED', () => {
            const valid = executionUtils.isValidExecutionStatusTransition({
                from: ExecutionStatus.RUNNING,
                to: ExecutionStatus.COMPLETED,
            })
            expect(valid).toBe(true)
        })

        it('allows RUNNING -> FAILED', () => {
            const valid = executionUtils.isValidExecutionStatusTransition({
                from: ExecutionStatus.RUNNING,
                to: ExecutionStatus.FAILED,
            })
            expect(valid).toBe(true)
        })

        it('allows RUNNING -> CANCELLED', () => {
            const valid = executionUtils.isValidExecutionStatusTransition({
                from: ExecutionStatus.RUNNING,
                to: ExecutionStatus.CANCELLED,
            })
            expect(valid).toBe(true)
        })

        it('rejects COMPLETED -> RUNNING', () => {
            const valid = executionUtils.isValidExecutionStatusTransition({
                from: ExecutionStatus.COMPLETED,
                to: ExecutionStatus.RUNNING,
            })
            expect(valid).toBe(false)
        })

        it('rejects FAILED -> COMPLETED', () => {
            const valid = executionUtils.isValidExecutionStatusTransition({
                from: ExecutionStatus.FAILED,
                to: ExecutionStatus.COMPLETED,
            })
            expect(valid).toBe(false)
        })

        it('rejects CANCELLED -> RUNNING', () => {
            const valid = executionUtils.isValidExecutionStatusTransition({
                from: ExecutionStatus.CANCELLED,
                to: ExecutionStatus.RUNNING,
            })
            expect(valid).toBe(false)
        })
    })
})
