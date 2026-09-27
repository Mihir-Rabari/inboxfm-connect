import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { redisConnections } from '../../../../src/app/database/redis-connections'
import { system } from '../../../../src/app/helper/system/system'
import { AppSystemProp } from '../../../../src/app/helper/system/system-props'
import { createTestContext, TestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

// Tracks the configured AP_API_RATE_LIMIT_SYNC_MAX (default 60, see system.ts)
// instead of hardcoding it, so an overridden limit exercises the right
// threshold. The tier itself is still read eagerly at module load time
// (core/security/rate-limit.ts) from the same process env, so both agree.
const SYNC_IP_MAX = Number.parseInt(system.getOrThrow(AppSystemProp.API_RATE_LIMIT_SYNC_MAX), 10)

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

    it('keeps buckets per IP: a second client stays unthrottled', async () => {
        const firstIp = '198.51.100.31'
        const secondIp = '198.51.100.32'

        for (let i = 0; i < SYNC_IP_MAX; i++) {
            const response = await ctx.inject({
                method: 'GET',
                url: '/api/v1/executions',
                query: { projectId: ctx.project.id },
                headers: { 'x-real-ip': firstIp },
            })
            expect(response.statusCode).toBe(StatusCodes.OK)
        }

        const throttled = await ctx.inject({
            method: 'GET',
            url: '/api/v1/executions',
            query: { projectId: ctx.project.id },
            headers: { 'x-real-ip': firstIp },
        })
        expect(throttled.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)

        const otherClient = await ctx.inject({
            method: 'GET',
            url: '/api/v1/executions',
            query: { projectId: ctx.project.id },
            headers: { 'x-real-ip': secondIp },
        })
        expect(otherClient.statusCode).toBe(StatusCodes.OK)
    })

    it('keys direct access without the IP header by peer IP instead of failing', async () => {
        for (let i = 0; i < SYNC_IP_MAX; i++) {
            const response = await ctx.inject({
                method: 'GET',
                url: '/api/v1/executions',
                query: { projectId: ctx.project.id },
            })
            expect(response.statusCode).toBe(StatusCodes.OK)
        }

        const throttled = await ctx.inject({
            method: 'GET',
            url: '/api/v1/executions',
            query: { projectId: ctx.project.id },
        })
        expect(throttled.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)
    })
})
