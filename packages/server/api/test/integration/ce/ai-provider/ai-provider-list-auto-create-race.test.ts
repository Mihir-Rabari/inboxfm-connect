import { AIProviderName } from '@inboxfm-connect/core-utils'
import { PrincipalType } from '@inboxfm-connect/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { Redis } from 'ioredis'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { redisConnections } from '../../../../src/app/database/redis-connections'
import { system } from '../../../../src/app/helper/system/system'
import { AppSystemProp } from '../../../../src/app/helper/system/system-props'
import { generateMockToken } from '../../../helpers/auth'
import { mockAndSaveBasicSetup } from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

async function deleteKeysByPattern(redis: Redis, pattern: string): Promise<void> {
    const stream = redis.scanStream({ match: pattern, count: 100 })
    for await (const keys of stream) {
        if (keys.length > 0) {
            await redis.del(...keys)
        }
    }
}

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
    // The auto-create branch is gated on the managed-AI flag; point the gate
    // at a configured key for the whole suite so every list call exercises
    // the branch (the gate is read per-request, not memoized).
    const originalGet = system.get.bind(system)
    vi.spyOn(system, 'get').mockImplementation((prop: AppSystemProp) => {
        if (prop === AppSystemProp.OPENROUTER_PROVISION_KEY) {
            return 'test-provision-key'
        }
        return originalGet(prop)
    })
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(async () => {
    const redis = await redisConnections.useExisting()
    await deleteKeysByPattern(redis, 'redlock:*')
    await deleteKeysByPattern(redis, 'ai-provider:list-auto-create:*')
})

async function testSetupWithToken(): Promise<{ mockPlatform: { id: string }, mockUserToken: string }> {
    const { mockPlatform, mockOwner } = await mockAndSaveBasicSetup()
    const mockUserToken = await generateMockToken({
        id: mockOwner.id,
        type: PrincipalType.USER,
        platform: { id: mockPlatform.id },
    })
    return { mockPlatform, mockUserToken }
}

describe('AI Providers API - concurrent list auto-create race', () => {
    it('concurrent first GET /v1/ai-providers calls all succeed and create exactly one ACTIVEPIECES row', async () => {
        // arrange
        const { mockPlatform, mockUserToken } = await testSetupWithToken()

        const makeRequest = () => app!.inject({
            method: 'GET',
            url: '/api/v1/ai-providers',
            headers: {
                authorization: 'Bearer ' + mockUserToken,
            },
        })

        // act - five simultaneous first-ever list calls on a platform that
        // has no providers yet. Pre-fix, every call passes the existsBy
        // check before any insert lands, so four of the five save() calls
        // hit the unique index (platformId, provider) and the losers
        // surface raw driver errors (500 / 409) on a plain GET route.
        const responses = await Promise.all([
            makeRequest(),
            makeRequest(),
            makeRequest(),
            makeRequest(),
            makeRequest(),
        ])

        // assert
        const codes = responses.map((r) => r.statusCode)
        expect(codes.filter((code) => code === StatusCodes.OK)).toHaveLength(5)

        const rows = await databaseConnection().getRepository('ai_provider').find({
            where: { platformId: mockPlatform.id, provider: AIProviderName.ACTIVEPIECES },
        })
        expect(rows).toHaveLength(1)
        expect(rows[0].enabledForChat).toBe(true)
    })

    it('sequential first GET calls do not create a second ACTIVEPIECES row', async () => {
        // arrange
        const { mockPlatform, mockUserToken } = await testSetupWithToken()

        const makeRequest = () => app!.inject({
            method: 'GET',
            url: '/api/v1/ai-providers',
            headers: {
                authorization: 'Bearer ' + mockUserToken,
            },
        })

        // act
        const first = await makeRequest()
        const second = await makeRequest()

        // assert
        expect(first.statusCode).toBe(StatusCodes.OK)
        expect(second.statusCode).toBe(StatusCodes.OK)

        const rows = await databaseConnection().getRepository('ai_provider').find({
            where: { platformId: mockPlatform.id, provider: AIProviderName.ACTIVEPIECES },
        })
        expect(rows).toHaveLength(1)
    })
})
