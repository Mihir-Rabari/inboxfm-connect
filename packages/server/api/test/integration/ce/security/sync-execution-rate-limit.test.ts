import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { redisConnections } from '../../../../src/app/database/redis-connections'
import { createTestContext, TestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

// Mirrors the production default AP_API_RATE_LIMIT_SYNC_MAX (see system.ts).
// Read eagerly at module load time (core/security/rate-limit.ts), so the test
// exercises the real default rather than mocking a lower threshold — same
// caveat as the auth abuse-protection test.
const SYNC_IP_MAX = 60

beforeAll(async () => {
    app = await setupTestEnvironment({ fresh: true })
})

afterAll(async () => {
    await teardownTestEnvironment()
})

afterEach(async () => {
    vi.restoreAllMocks()
    // Dedicated, ephemeral redis-memory-server instance for this test file —
    // flushall is safe and avoids enumerating every key prefix the rate
    // limiter might use.
    const redis = await redisConnections.useExisting()
    await redis.flushall()
})

describe('Sync-execution rate-limit tier', () => {
    let ctx: TestContext

    beforeEach(async () => {
        ctx = await createTestContext(app!)
    })

    it('allows executions list up to the limit, then returns 429 with Retry-After', async () => {
        const ip = '198.51.100.30'

        for (let i = 0; i < SYNC_IP_MAX; i++) {
            const response = await ctx.inject({
                method: 'GET',
                url: '/api/v1/executions',
                query: { projectId: ctx.project.id },
                headers: { 'x-real-ip': ip },
            })
            expect(response.statusCode).toBe(StatusCodes.OK)
        }

        const throttled = await ctx.inject({
            method: 'GET',
            url: '/api/v1/executions',
            query: { projectId: ctx.project.id },
            headers: { 'x-real-ip': ip },
        })
        expect(throttled.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)
        expect(throttled.headers['retry-after']).toBeDefined()
    })
})
