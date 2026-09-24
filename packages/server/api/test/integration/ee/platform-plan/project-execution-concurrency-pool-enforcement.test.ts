import { apId } from '@inboxfm-connect/core-utils'
import { TriggerBindingStatus } from '@inboxfm-connect/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { redisConnections } from '../../../../src/app/database/redis-connections'
import { concurrencyPoolService } from '../../../../src/app/ee/platform/concurrency-pool/concurrency-pool.service'
import { userInteractionWatcher } from '../../../../src/app/helper/user-interaction/user-interaction-watcher'
import { db } from '../../../helpers/db'
import { createTestContext, TestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

/**
 * `ConcurrencyPoolEntity.maxConcurrentJobs` is settable today via
 * `platform-project-service.ts#update` and `managed-authn-service.ts`, cached via
 * `distributedStore`, but was never read back by anything before
 * `concurrencyPoolExecutionHooks` (wired in app.ts for EE/Cloud). This proves a
 * project's assigned pool limit is now actually enforced on the trigger-binding RUN
 * path — and, deliberately, WITHOUT enabling
 * `PROJECT_EXECUTION_CONCURRENCY_LIMITER_ENABLED`: an explicit pool assignment is an
 * admin already opting in, independent of that platform-wide default-off flag.
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

async function assignPool(ctx: TestContext, maxConcurrentJobs: number): Promise<void> {
    const { poolId } = await concurrencyPoolService(app!.log).upsertPool({
        platformId: ctx.platform.id,
        key: ctx.project.id,
        maxConcurrentJobs,
    })
    await databaseConnection().getRepository('project').update({ id: ctx.project.id }, { poolId })
    await concurrencyPoolService(app!.log).assignProject({ projectId: ctx.project.id, poolId })
}

describe('Project execution concurrency guard — concurrency pool enforcement (EE)', () => {
    it('enforces a project\'s assigned pool limit even though PROJECT_EXECUTION_CONCURRENCY_LIMITER_ENABLED stays off', async () => {
        const ctx = await createTestContext(app!)
        await assignPool(ctx, 1)
        const binding = await saveEnabledBinding(ctx)
        stubSlowEngineRunHook()

        const responses = await Promise.all([
            runUnauthenticated(binding.id),
            runUnauthenticated(binding.id),
        ])

        const statusCodes = responses.map((response) => response.statusCode).sort()
        expect(statusCodes).toEqual([StatusCodes.OK, StatusCodes.TOO_MANY_REQUESTS])

        const throttled = responses.find((response) => response.statusCode === StatusCodes.TOO_MANY_REQUESTS)
        const body = throttled!.json()
        expect(body.code).toBe('PROJECT_EXECUTION_CONCURRENCY_LIMIT_EXCEEDED')
        expect(body.params.limit).toBe(1)
    })

    it('leaves a project with no assigned pool unthrottled', async () => {
        const ctx = await createTestContext(app!)
        const binding = await saveEnabledBinding(ctx)
        stubSlowEngineRunHook()

        const responses = await Promise.all(
            Array.from({ length: 4 }, () => runUnauthenticated(binding.id)),
        )

        expect(responses.every((response) => response.statusCode === StatusCodes.OK)).toBe(true)
    })
})
