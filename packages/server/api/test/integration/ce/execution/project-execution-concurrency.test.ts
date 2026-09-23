import { apId } from '@inboxfm-connect/core-utils'
import { TriggerBindingStatus } from '@inboxfm-connect/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { redisConnections } from '../../../../src/app/database/redis-connections'
import { system } from '../../../../src/app/helper/system/system'
import { AppSystemProp } from '../../../../src/app/helper/system/system-props'
import { userInteractionWatcher } from '../../../../src/app/helper/user-interaction/user-interaction-watcher'
import { db } from '../../../helpers/db'
import { createTestContext, TestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

/**
 * Covers the per-project execution concurrency cap (issue #47). There is no BullMQ
 * queue on the `POST /:id/run` path — `triggerBindingService.executeRun` calls
 * `userInteractionWatcher.submitAndWaitForResponse` synchronously in-process
 * against a shared, fixed-size sandbox pool — so "concurrent executions" means
 * "requests currently inside that in-process call for a project", enforced by a
 * Redis-backed counter (`projectExecutionConcurrencyGuard`). The engine hook is
 * stubbed with an artificial delay so concurrently-fired requests are guaranteed
 * to overlap inside the guard's acquire/release window, following the same
 * `Promise.all` concurrency-race pattern as `field-position.test.ts`.
 */
let app: FastifyInstance | null = null

const HOLD_MS = 200

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

afterEach(async () => {
    vi.restoreAllMocks()
    const redis = await redisConnections.useExisting()
    const keys = await redis.keys('project-execution-concurrency:*')
    if (keys.length > 0) {
        await redis.del(...keys)
    }
})

function stubSlowEngineRunHook(): void {
    vi.spyOn(userInteractionWatcher, 'submitAndWaitForResponse').mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, HOLD_MS))
        return { output: [{ n: 1 }] } as never
    })
}

async function saveEnabledBinding(ctx: TestContext): Promise<{ id: string }> {
    const now = new Date().toISOString()
    const row = {
        id: apId(),
        created: now,
        updated: now,
        projectId: ctx.project.id,
        platformId: ctx.platform.id,
        pieceName: '@inboxfm-connect/piece-webhook',
        pieceVersion: '0.1.0',
        triggerName: 'catch_webhook',
        connectionId: null,
        promptTemplate: 'Handle {{item}}',
        settings: {},
        propertySettings: null,
        status: TriggerBindingStatus.ENABLED,
    }
    await db.save('trigger_binding', row)
    return row
}

function runUnauthenticated(bindingId: string): ReturnType<FastifyInstance['inject']> {
    return app!.inject({
        method: 'POST',
        url: `/api/v1/trigger-bindings/${bindingId}/run`,
    })
}

function enableLimiter({ limit }: { limit: number }): void {
    const originalGetBoolean = system.getBoolean.bind(system)
    const originalGetNumber = system.getNumber.bind(system)
    vi.spyOn(system, 'getBoolean').mockImplementation((prop) => {
        if (prop === AppSystemProp.PROJECT_EXECUTION_CONCURRENCY_LIMITER_ENABLED) {
            return true
        }
        return originalGetBoolean(prop)
    })
    vi.spyOn(system, 'getNumber').mockImplementation((prop) => {
        if (prop === AppSystemProp.PROJECT_EXECUTION_CONCURRENCY_LIMIT) {
            return limit
        }
        if (prop === AppSystemProp.PROJECT_EXECUTION_CONCURRENCY_SLOT_TTL_SECONDS) {
            return 60
        }
        return originalGetNumber(prop)
    })
}

describe('Project execution concurrency guard', () => {
    it('does not throttle concurrent runs when PROJECT_EXECUTION_CONCURRENCY_LIMITER_ENABLED is off (default)', async () => {
        const ctx = await createTestContext(app!)
        const binding = await saveEnabledBinding(ctx)
        stubSlowEngineRunHook()

        const responses = await Promise.all(
            Array.from({ length: 5 }, () => runUnauthenticated(binding.id)),
        )

        expect(responses.every((response) => response.statusCode === StatusCodes.OK)).toBe(true)
    })

    describe('when PROJECT_EXECUTION_CONCURRENCY_LIMITER_ENABLED is on', () => {
        it('rejects the run over the limit while it is still in flight, then recovers once a slot frees', async () => {
            enableLimiter({ limit: 2 })
            const ctx = await createTestContext(app!)
            const binding = await saveEnabledBinding(ctx)
            stubSlowEngineRunHook()

            const responses = await Promise.all([
                runUnauthenticated(binding.id),
                runUnauthenticated(binding.id),
                runUnauthenticated(binding.id),
            ])

            const statusCodes = responses.map((response) => response.statusCode).sort()
            expect(statusCodes).toEqual([StatusCodes.OK, StatusCodes.OK, StatusCodes.TOO_MANY_REQUESTS])

            const throttled = responses.find((response) => response.statusCode === StatusCodes.TOO_MANY_REQUESTS)
            const body = throttled!.json()
            expect(body.code).toBe('PROJECT_EXECUTION_CONCURRENCY_LIMIT_EXCEEDED')
            expect(body.params.projectId).toBe(ctx.project.id)
            expect(body.params.limit).toBe(2)
            expect(throttled!.headers['retry-after']).toBeDefined()

            // Both in-flight slots have released by now (HOLD_MS elapsed), so a fresh
            // run must succeed — proving `release()` actually frees the slot rather
            // than leaking it.
            const recovered = await runUnauthenticated(binding.id)
            expect(recovered.statusCode).toBe(StatusCodes.OK)
        })

        it('scopes the limit per project, so a different project is unaffected', async () => {
            enableLimiter({ limit: 1 })
            const throttledCtx = await createTestContext(app!)
            const otherCtx = await createTestContext(app!)
            const throttledBinding = await saveEnabledBinding(throttledCtx)
            const otherBinding = await saveEnabledBinding(otherCtx)
            stubSlowEngineRunHook()

            const [throttledFirst, throttledSecond, otherFirst] = await Promise.all([
                runUnauthenticated(throttledBinding.id),
                runUnauthenticated(throttledBinding.id),
                runUnauthenticated(otherBinding.id),
            ])

            const throttledStatusCodes = [throttledFirst.statusCode, throttledSecond.statusCode].sort()
            expect(throttledStatusCodes).toEqual([StatusCodes.OK, StatusCodes.TOO_MANY_REQUESTS])
            expect(otherFirst.statusCode).toBe(StatusCodes.OK)
        })
    })
})
