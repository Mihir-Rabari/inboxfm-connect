import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { redisConnections } from '../../../../src/app/database/redis-connections'
import { system } from '../../../../src/app/helper/system/system'
import { AppSystemProp } from '../../../../src/app/helper/system/system-props'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

const RATE_LIMITED_ROUTE = '/v1/connections'
const RATE_LIMIT_TEST_MAX_REQUESTS = 3

beforeAll(async () => {
    app = await setupTestEnvironment({ fresh: true })
})

afterAll(async () => {
    await teardownTestEnvironment()
})

afterEach(async () => {
    const redis = await redisConnections.useExisting()
    const keys = await redis.keys('project-rate-limit:*')
    if (keys.length > 0) {
        await redis.del(...keys)
    }
})

describe('Project rate limiter', () => {
    it('does not throttle requests when PROJECT_RATE_LIMITER_ENABLED is off (default)', async () => {
        const ctx = await createTestContext(app!)

        for (let i = 0; i < RATE_LIMIT_TEST_MAX_REQUESTS + 2; i++) {
            const response = await ctx.get(RATE_LIMITED_ROUTE, { projectId: ctx.project.id })
            expect(response.statusCode).toBe(StatusCodes.OK)
        }
    })

    describe('when PROJECT_RATE_LIMITER_ENABLED is on', () => {
        beforeAll(() => {
            const originalGetBoolean = system.getBoolean.bind(system)
            const originalGetNumber = system.getNumber.bind(system)
            vi.spyOn(system, 'getBoolean').mockImplementation((prop) => {
                if (prop === AppSystemProp.PROJECT_RATE_LIMITER_ENABLED) {
                    return true
                }
                return originalGetBoolean(prop)
            })
            vi.spyOn(system, 'getNumber').mockImplementation((prop) => {
                if (prop === AppSystemProp.PROJECT_RATE_LIMITER_MAX_REQUESTS) {
                    return RATE_LIMIT_TEST_MAX_REQUESTS
                }
                if (prop === AppSystemProp.PROJECT_RATE_LIMITER_WINDOW_SECONDS) {
                    return 60
                }
                return originalGetNumber(prop)
            })
        })

        afterAll(() => {
            vi.restoreAllMocks()
        })

        it('allows requests up to the configured limit, then returns 429', async () => {
            const ctx = await createTestContext(app!)

            for (let i = 0; i < RATE_LIMIT_TEST_MAX_REQUESTS; i++) {
                const response = await ctx.get(RATE_LIMITED_ROUTE, { projectId: ctx.project.id })
                expect(response.statusCode).toBe(StatusCodes.OK)
            }

            const throttledResponse = await ctx.get(RATE_LIMITED_ROUTE, { projectId: ctx.project.id })
            expect(throttledResponse.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)
            const body = throttledResponse.json()
            expect(body.code).toBe('PROJECT_RATE_LIMIT_EXCEEDED')
            expect(body.params.projectId).toBe(ctx.project.id)
        })

        it('scopes the limit per project, so a different project is unaffected', async () => {
            const throttledCtx = await createTestContext(app!)
            const otherCtx = await createTestContext(app!)

            for (let i = 0; i < RATE_LIMIT_TEST_MAX_REQUESTS; i++) {
                const response = await throttledCtx.get(RATE_LIMITED_ROUTE, { projectId: throttledCtx.project.id })
                expect(response.statusCode).toBe(StatusCodes.OK)
            }
            const throttledResponse = await throttledCtx.get(RATE_LIMITED_ROUTE, { projectId: throttledCtx.project.id })
            expect(throttledResponse.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)

            const otherProjectResponse = await otherCtx.get(RATE_LIMITED_ROUTE, { projectId: otherCtx.project.id })
            expect(otherProjectResponse.statusCode).toBe(StatusCodes.OK)
        })
    })
})
