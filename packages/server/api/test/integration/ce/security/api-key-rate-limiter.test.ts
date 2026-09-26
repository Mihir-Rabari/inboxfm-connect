import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { redisConnections } from '../../../../src/app/database/redis-connections'
import { system } from '../../../../src/app/helper/system/system'
import { AppSystemProp } from '../../../../src/app/helper/system/system-props'
import { db } from '../../../helpers/db'
import { createMockConnectApiKey, mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

const RATE_LIMIT_TEST_MAX_REQUESTS = 3

beforeAll(async () => {
    app = await setupTestEnvironment({ fresh: true })
})

afterAll(async () => {
    await teardownTestEnvironment()
})

afterEach(async () => {
    const redis = await redisConnections.useExisting()
    const keys = await redis.keys('api-key-rate-limit:*')
    if (keys.length > 0) {
        await redis.del(...keys)
    }
})

async function callWithKey(rawValue: string, projectId: string, externalUserId: string) {
    return app?.inject({
        method: 'POST',
        url: '/api/v1/connect-sessions',
        headers: { authorization: `Bearer ${rawValue}` },
        payload: { projectId, externalUserId },
    })
}

describe('API key rate limiter', () => {
    it('does not throttle requests when API_KEY_RATE_LIMITER_ENABLED is off (default)', async () => {
        const { mockPlatform, mockProject } = await mockAndSaveBasicSetup()
        const mockKey = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: mockProject.id })
        await db.save('connect_api_key', mockKey)

        for (let i = 0; i < RATE_LIMIT_TEST_MAX_REQUESTS + 2; i++) {
            const response = await callWithKey(mockKey.value, mockProject.id, `user-${i}`)
            expect(response?.statusCode).toBe(StatusCodes.CREATED)
        }
    })

    describe('when API_KEY_RATE_LIMITER_ENABLED is on', () => {
        beforeAll(() => {
            const originalGetBoolean = system.getBoolean.bind(system)
            const originalGetNumber = system.getNumber.bind(system)
            vi.spyOn(system, 'getBoolean').mockImplementation((prop) => {
                if (prop === AppSystemProp.API_KEY_RATE_LIMITER_ENABLED) {
                    return true
                }
                return originalGetBoolean(prop)
            })
            vi.spyOn(system, 'getNumber').mockImplementation((prop) => {
                if (prop === AppSystemProp.API_KEY_RATE_LIMITER_MAX_REQUESTS) {
                    return RATE_LIMIT_TEST_MAX_REQUESTS
                }
                if (prop === AppSystemProp.API_KEY_RATE_LIMITER_WINDOW_SECONDS) {
                    return 60
                }
                return originalGetNumber(prop)
            })
        })

        afterAll(() => {
            vi.restoreAllMocks()
        })

        it('allows requests up to the configured limit, then returns 429', async () => {
            const { mockPlatform, mockProject } = await mockAndSaveBasicSetup()
            const mockKey = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: mockProject.id })
            await db.save('connect_api_key', mockKey)

            for (let i = 0; i < RATE_LIMIT_TEST_MAX_REQUESTS; i++) {
                const response = await callWithKey(mockKey.value, mockProject.id, `user-${i}`)
                expect(response?.statusCode).toBe(StatusCodes.CREATED)
            }

            const throttledResponse = await callWithKey(mockKey.value, mockProject.id, 'user-overflow')
            expect(throttledResponse?.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)
            const body = throttledResponse?.json()
            expect(body.code).toBe('API_KEY_RATE_LIMIT_EXCEEDED')
            expect(body.params.apiKeyId).toBe(mockKey.id)
        })

        it('scopes the limit per api key, so a different key on the same project/IP is unaffected', async () => {
            const { mockPlatform, mockProject } = await mockAndSaveBasicSetup()
            const throttledKey = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: mockProject.id })
            const otherKey = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: mockProject.id })
            await db.save('connect_api_key', [throttledKey, otherKey])

            for (let i = 0; i < RATE_LIMIT_TEST_MAX_REQUESTS; i++) {
                const response = await callWithKey(throttledKey.value, mockProject.id, `user-${i}`)
                expect(response?.statusCode).toBe(StatusCodes.CREATED)
            }
            const throttledResponse = await callWithKey(throttledKey.value, mockProject.id, 'user-overflow')
            expect(throttledResponse?.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)

            const otherKeyResponse = await callWithKey(otherKey.value, mockProject.id, 'user-other-key')
            expect(otherKeyResponse?.statusCode).toBe(StatusCodes.CREATED)
        })
    })
})
