import { tryCatch } from '@inboxfm-connect/core-utils'
import { ExecutionEvent, ExecutionEventType } from '@inboxfm-connect/shared'
import { describe, expect, it } from 'vitest'
import { executionEventService } from '../../../../src/app/execution/execution-event.service'
import { pubsub } from '../../../../src/app/helper/pubsub'

async function waitUntil(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
    const start = Date.now()
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error('waitUntil: condition not met within timeout')
        }
        await new Promise((resolve) => setTimeout(resolve, 20))
    }
}

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

    describe('Cross-replica delivery via Redis pub/sub', () => {
        it('delivers an event published on the pub/sub channel directly, independent of the emitting process\'s in-memory listener map', async () => {
            const executionId = 'exec_test_cross_replica'
            const received: ExecutionEvent[] = []

            await executionEventService.subscribe({
                executionId,
                listener: (event) => received.push(event),
            })

            // Bypasses `emit()`'s local `memoryListeners` notification entirely — this is
            // the same channel a completion signal published from a *different* app
            // replica would use, so a subscriber that only shares Redis with the
            // publisher (not process memory) must still receive it.
            const crossReplicaEvent: ExecutionEvent = {
                id: `${executionId}:999`,
                executionId,
                type: ExecutionEventType.ExecutionCompleted,
                timestamp: new Date().toISOString(),
                payload: { executionId, output: { success: true } },
            }
            const { error: publishError } = await tryCatch(() => pubsub.publish(`execution:${executionId}:events`, JSON.stringify(crossReplicaEvent)))

            if (publishError) {
                // No Redis reachable in this run (matches `execution-event.service.ts`'s own
                // "offline unit tests" fallback) — nothing to assert about cross-replica
                // delivery without a real pub/sub backend.
                await executionEventService.unsubscribe({ executionId })
                return
            }

            await waitUntil(() => received.length === 1)

            expect(received[0].id).toBe(crossReplicaEvent.id)
            expect(received[0].type).toBe(ExecutionEventType.ExecutionCompleted)

            await executionEventService.unsubscribe({ executionId })
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
