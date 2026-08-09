import { ExecutionEvent, ExecutionEventType } from '@inboxfm-connect/shared'
import { describe, expect, it } from 'vitest'
import { executionEventService } from '../../../../src/app/execution/execution-event.service'

describe('ExecutionEvent Service', () => {
    describe('parseSequenceFromId', () => {
        it('parses valid event ID sequence', () => {
            const seq = executionEventService.parseSequenceFromId({ eventId: 'exec_123:42' })
            expect(seq).toBe(42)
        })

        it('returns null for invalid or empty event ID', () => {
            expect(executionEventService.parseSequenceFromId({ eventId: undefined })).toBeNull()
            expect(executionEventService.parseSequenceFromId({ eventId: 'invalid' })).toBeNull()
        })
    })

    describe('Monotonic Sequence & History Replay', () => {
        it('emits events with monotonic IDs and replays since lastEventId', async () => {
            const executionId = 'exec_test_replay'

            const event1 = await executionEventService.emit({
                executionId,
                type: ExecutionEventType.ExecutionStarted,
                payload: { executionId, prompt: 'hello', timestamp: new Date().toISOString() },
            })

            const event2 = await executionEventService.emit({
                executionId,
                type: ExecutionEventType.PlannerStarted,
                payload: { executionId, model: 'gpt-4o', timestamp: new Date().toISOString() },
            })

            const event3 = await executionEventService.emit({
                executionId,
                type: ExecutionEventType.ExecutionCompleted,
                payload: { executionId, output: { success: true } },
            })

            expect(event1.id).toContain(':')
            expect(event2.id).toContain(':')
            expect(event3.id).toContain(':')

            const seq1 = executionEventService.parseSequenceFromId({ eventId: event1.id })!
            const seq2 = executionEventService.parseSequenceFromId({ eventId: event2.id })!
            const seq3 = executionEventService.parseSequenceFromId({ eventId: event3.id })!

            expect(seq2).toBeGreaterThan(seq1)
            expect(seq3).toBeGreaterThan(seq2)

            const replayed = await executionEventService.getEventsSince({
                executionId,
                lastEventId: event1.id,
            })

            expect(replayed.length).toBe(2)
            expect(replayed[0].id).toBe(event2.id)
            expect(replayed[1].id).toBe(event3.id)
        })
    })

    describe('Forbidden Graph Fields Audit', () => {
        it('ensures ExecutionEvent schema contains zero graph/workflow fields', () => {
            const keys = Object.keys(ExecutionEvent.shape)
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
