import { describe, expect, it } from 'vitest'
import { StreamStepProgress } from '../../src/lib/engine/engine-operation'
import { FlowActionType } from '../../src/lib/flows/actions/action'
import {
    DelayPauseMetadata,
    FAILED_STATES,
    FlowRunStatus,
    isFailedState,
    isFlowRunStateTerminal,
    PauseMetadata,
    PauseType,
    RespondResponse,
    StopResponse,
    WebhookPauseMetadata,
} from '../../src/lib/flow-run/execution/flow-execution'
import {
    GenericStepOutput,
    LoopStepOutput,
    RouterStepOutput,
    StepOutputStatus,
    StepOutputType,
} from '../../src/lib/flow-run/execution/step-output'

describe('Flow Execution & Step Output', () => {
    describe('isFlowRunStateTerminal', () => {
        it('returns true for unconditionally terminal states', () => {
            const terminalStates = [
                FlowRunStatus.SUCCEEDED,
                FlowRunStatus.TIMEOUT,
                FlowRunStatus.FAILED,
                FlowRunStatus.QUOTA_EXCEEDED,
                FlowRunStatus.MEMORY_LIMIT_EXCEEDED,
                FlowRunStatus.LOG_SIZE_EXCEEDED,
                FlowRunStatus.CANCELED,
            ]

            for (const status of terminalStates) {
                expect(isFlowRunStateTerminal({ status, ignoreInternalError: false })).toBe(true)
                expect(isFlowRunStateTerminal({ status, ignoreInternalError: true })).toBe(true)
            }
        })

        it('returns false for active/queued/paused non-terminal states', () => {
            const nonTerminalStates = [
                FlowRunStatus.QUEUED,
                FlowRunStatus.RUNNING,
                FlowRunStatus.PAUSED,
            ]

            for (const status of nonTerminalStates) {
                expect(isFlowRunStateTerminal({ status, ignoreInternalError: false })).toBe(false)
                expect(isFlowRunStateTerminal({ status, ignoreInternalError: true })).toBe(false)
            }
        })

        it('handles INTERNAL_ERROR depending on ignoreInternalError flag', () => {
            expect(isFlowRunStateTerminal({
                status: FlowRunStatus.INTERNAL_ERROR,
                ignoreInternalError: false,
            })).toBe(true)

            expect(isFlowRunStateTerminal({
                status: FlowRunStatus.INTERNAL_ERROR,
                ignoreInternalError: true,
            })).toBe(false)
        })
    })

    describe('isFailedState and FAILED_STATES', () => {
        it('includes all expected failure states in FAILED_STATES', () => {
            expect(FAILED_STATES).toEqual([
                FlowRunStatus.FAILED,
                FlowRunStatus.INTERNAL_ERROR,
                FlowRunStatus.QUOTA_EXCEEDED,
                FlowRunStatus.TIMEOUT,
                FlowRunStatus.MEMORY_LIMIT_EXCEEDED,
            ])
        })

        it('returns true for all states in FAILED_STATES', () => {
            for (const status of FAILED_STATES) {
                expect(isFailedState(status)).toBe(true)
            }
        })

        it('returns false for non-failed states', () => {
            const nonFailedStates = [
                FlowRunStatus.SUCCEEDED,
                FlowRunStatus.RUNNING,
                FlowRunStatus.PAUSED,
                FlowRunStatus.QUEUED,
                FlowRunStatus.CANCELED,
                FlowRunStatus.LOG_SIZE_EXCEEDED,
            ]

            for (const status of nonFailedStates) {
                expect(isFailedState(status)).toBe(false)
            }
        })
    })

    describe('Pause and Response Schemas', () => {
        it('validates DelayPauseMetadata with required and optional fields', () => {
            const validMinimal = {
                type: PauseType.DELAY,
                resumeDateTime: '2026-10-06T12:00:00.000Z',
            }
            expect(DelayPauseMetadata.safeParse(validMinimal).success).toBe(true)

            const validFull = {
                type: PauseType.DELAY,
                resumeDateTime: '2026-10-06T12:00:00.000Z',
                requestIdToReply: 'req-123',
                handlerId: 'handler-abc',
                streamStepProgress: StreamStepProgress.AIRDROP,
            }
            expect(DelayPauseMetadata.safeParse(validFull).success).toBe(true)

            const invalidType = {
                type: 'UNKNOWN',
                resumeDateTime: '2026-10-06T12:00:00.000Z',
            }
            expect(DelayPauseMetadata.safeParse(invalidType).success).toBe(false)

            const missingResume = {
                type: PauseType.DELAY,
            }
            expect(DelayPauseMetadata.safeParse(missingResume).success).toBe(false)
        })

        it('validates RespondResponse schema', () => {
            const emptyObj = {}
            expect(RespondResponse.safeParse(emptyObj).success).toBe(true)

            const fullResponse = {
                status: 200,
                body: { message: 'hello' },
                headers: { 'content-type': 'application/json' },
            }
            expect(RespondResponse.safeParse(fullResponse).success).toBe(true)

            const invalidStatus = {
                status: '200',
            }
            expect(RespondResponse.safeParse(invalidStatus).success).toBe(false)
        })

        it('validates StopResponse schema', () => {
            const emptyObj = {}
            expect(StopResponse.safeParse(emptyObj).success).toBe(true)

            const fullStop = {
                status: 400,
                body: 'rejected',
                headers: { 'x-reason': 'stopped' },
            }
            expect(StopResponse.safeParse(fullStop).success).toBe(true)
        })

        it('validates WebhookPauseMetadata and union PauseMetadata', () => {
            const validWebhook = {
                type: PauseType.WEBHOOK,
                requestId: 'hook-req-1',
                requestIdToReply: 'reply-1',
                response: { status: 200 },
                handlerId: 'handler-hook',
            }
            expect(WebhookPauseMetadata.safeParse(validWebhook).success).toBe(true)
            expect(PauseMetadata.safeParse(validWebhook).success).toBe(true)

            const validDelay = {
                type: PauseType.DELAY,
                resumeDateTime: '2026-10-06T14:00:00.000Z',
            }
            expect(PauseMetadata.safeParse(validDelay).success).toBe(true)

            const invalidUnion = {
                type: 'OTHER',
            }
            expect(PauseMetadata.safeParse(invalidUnion).success).toBe(false)
        })
    })

    describe('GenericStepOutput', () => {
        it('initializes with all properties set via constructor', () => {
            const step = new GenericStepOutput({
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
                input: { a: 1 },
                output: { b: 2 },
                outputType: StepOutputType.SLICE,
                duration: 150,
                errorMessage: 'no error',
            })

            expect(step.type).toBe(FlowActionType.CODE)
            expect(step.status).toBe(StepOutputStatus.SUCCEEDED)
            expect(step.input).toEqual({ a: 1 })
            expect(step.output).toEqual({ b: 2 })
            expect(step.outputType).toBe(StepOutputType.SLICE)
            expect(step.duration).toBe(150)
            expect(step.errorMessage).toBe('no error')
        })

        it('creates an instance using static create method', () => {
            const step = GenericStepOutput.create({
                type: FlowActionType.CODE,
                status: StepOutputStatus.RUNNING,
                input: { foo: 'bar' },
                output: null,
            })

            expect(step.type).toBe(FlowActionType.CODE)
            expect(step.status).toBe(StepOutputStatus.RUNNING)
            expect(step.input).toEqual({ foo: 'bar' })
            expect(step.output).toBeNull()
        })

        it('setOutput returns a new instance without mutating the original', () => {
            const original = GenericStepOutput.create({
                type: FlowActionType.CODE,
                status: StepOutputStatus.RUNNING,
                input: null,
                output: 'first',
            })

            const updated = original.setOutput('second')

            expect(updated).not.toBe(original)
            expect(original.output).toBe('first')
            expect(updated.output).toBe('second')
            expect(updated.status).toBe(original.status)
        })

        it('setStatus returns a new instance with updated status', () => {
            const original = GenericStepOutput.create({
                type: FlowActionType.CODE,
                status: StepOutputStatus.RUNNING,
                input: null,
            })

            const updated = original.setStatus(StepOutputStatus.SUCCEEDED)

            expect(updated).not.toBe(original)
            expect(original.status).toBe(StepOutputStatus.RUNNING)
            expect(updated.status).toBe(StepOutputStatus.SUCCEEDED)
        })

        it('setErrorMessage returns a new instance with updated errorMessage', () => {
            const original = GenericStepOutput.create({
                type: FlowActionType.CODE,
                status: StepOutputStatus.FAILED,
                input: null,
            })

            const updated = original.setErrorMessage('Timeout error')

            expect(updated).not.toBe(original)
            expect(original.errorMessage).toBeUndefined()
            expect(updated.errorMessage).toBe('Timeout error')
        })

        it('setDuration returns a new instance with updated duration', () => {
            const original = GenericStepOutput.create({
                type: FlowActionType.CODE,
                status: StepOutputStatus.SUCCEEDED,
                input: null,
            })

            const updated = original.setDuration(450)

            expect(updated).not.toBe(original)
            expect(original.duration).toBeUndefined()
            expect(updated.duration).toBe(450)
        })
    })

    describe('RouterStepOutput', () => {
        it('initializes router step output via static init', () => {
            const routerOutput = RouterStepOutput.init({ input: { conditionValue: 'match' } })

            expect(routerOutput.type).toBe(FlowActionType.ROUTER)
            expect(routerOutput.status).toBe(StepOutputStatus.SUCCEEDED)
            expect(routerOutput.input).toEqual({ conditionValue: 'match' })
        })
    })

    describe('LoopStepOutput', () => {
        it('initializes loop step output with default output structure', () => {
            const loopOutput = LoopStepOutput.init({ input: [1, 2, 3] })

            expect(loopOutput.type).toBe(FlowActionType.LOOP_ON_ITEMS)
            expect(loopOutput.status).toBe(StepOutputStatus.SUCCEEDED)
            expect(loopOutput.input).toEqual([1, 2, 3])
            expect(loopOutput.output).toEqual({
                item: undefined,
                index: 0,
                iterations: [],
            })
        })

        it('preserves custom output when provided to constructor', () => {
            const loopOutput = new LoopStepOutput({
                type: FlowActionType.LOOP_ON_ITEMS,
                status: StepOutputStatus.SUCCEEDED,
                input: ['apple'],
                output: {
                    item: 'apple',
                    index: 1,
                    iterations: [{}],
                },
            })

            expect(loopOutput.output?.item).toBe('apple')
            expect(loopOutput.output?.index).toBe(1)
            expect(loopOutput.output?.iterations.length).toBe(1)
        })

        it('setIterations updates iterations array immutably', () => {
            const initial = LoopStepOutput.init({ input: null })
            const iterations = [{ step_1: GenericStepOutput.create({ input: null, type: FlowActionType.CODE, status: StepOutputStatus.SUCCEEDED }) }]

            const updated = initial.setIterations(iterations)

            expect(updated).not.toBe(initial)
            expect(initial.output?.iterations).toEqual([])
            expect(updated.output?.iterations).toBe(iterations)
        })

        it('hasIteration checks if iteration index exists', () => {
            const loop = LoopStepOutput.init({ input: null }).addIteration()

            expect(loop.hasIteration(0)).toBe(true)
            expect(loop.hasIteration(1)).toBe(false)
            expect(loop.hasIteration(-1)).toBe(false)
        })

        it('setItemAndIndex updates item and index immutably', () => {
            const initial = LoopStepOutput.init({ input: null })
            const updated = initial.setItemAndIndex({ item: 'current-item', index: 3 })

            expect(updated).not.toBe(initial)
            expect(initial.output?.item).toBeUndefined()
            expect(initial.output?.index).toBe(0)
            expect(updated.output?.item).toBe('current-item')
            expect(updated.output?.index).toBe(3)
        })

        it('addIteration appends a new empty iteration immutably', () => {
            const initial = LoopStepOutput.init({ input: null })
            const withOne = initial.addIteration()
            const withTwo = withOne.addIteration()

            expect(initial.output?.iterations.length).toBe(0)
            expect(withOne.output?.iterations.length).toBe(1)
            expect(withTwo.output?.iterations.length).toBe(2)
            expect(withTwo.output?.iterations[0]).toEqual({})
            expect(withTwo.output?.iterations[1]).toEqual({})
        })
    })
})
