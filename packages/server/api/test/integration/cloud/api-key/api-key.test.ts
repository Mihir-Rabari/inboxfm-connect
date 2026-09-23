import { faker } from '@faker-js/faker'
import { wideEvent } from '@inboxfm-connect/server-utils'
import { PlatformRole, PrincipalType } from '@inboxfm-connect/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { apiKeyService } from '../../../../src/app/api-keys/api-key.service'
import { apiKeyService as eeApiKeyService } from '../../../../src/app/ee/api-keys/api-key-service'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import {
    createMockApiKey,
    mockAndSaveBasicSetup,
    mockBasicUser,
} from '../../../helpers/mocks'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('API Key API', () => {
    describe('Create API Key API', () => {
        it('should create a new API Key', async () => {
            const ctx = await createTestContext(app!)

            const mockApiKeyName = faker.lorem.word()
            const response = await ctx.post('/v1/api-keys', {
                displayName: mockApiKeyName,
            })

            const responseBody = response?.json()

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            expect(responseBody.id).toHaveLength(21)
            expect(responseBody.platformId).toBe(ctx.platform.id)
            expect(responseBody.hashedValue).toBeUndefined()
            expect(responseBody.displayName).toBe(mockApiKeyName)
            expect(responseBody.truncatedValue).toHaveLength(4)
            expect(responseBody.value).toHaveLength(64)
            expect(responseBody.value).toContain('sk-')
        })
    })

    describe('Delete API Key endpoint', () => {
        it('Fail if non owner', async () => {
            const { mockPlatform } = await mockAndSaveBasicSetup()
            const { mockUser } = await mockBasicUser({
                user: {
                    platformId: mockPlatform.id,
                    platformRole: PlatformRole.MEMBER,
                },
            })
            const mockApiKey = createMockApiKey({
                platformId: mockPlatform.id,
            })
            await db.save('api_key', mockApiKey)

            const testToken = await generateMockToken({
                type: PrincipalType.USER,
                id: mockUser.id,
                platform: { id: mockPlatform.id },
            })

            const response = await app?.inject({
                method: 'DELETE',
                url: `/api/v1/api-keys/${mockApiKey.id}`,
                headers: { authorization: `Bearer ${testToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        })
    })

    describe('List API Keys endpoint', () => {
        it('Filters Signing Keys by platform', async () => {
            const ctxOne = await createTestContext(app!)
            const ctxTwo = await createTestContext(app!)

            const mockKeyOne = createMockApiKey({ platformId: ctxOne.platform.id })
            const mockKeyTwo = createMockApiKey({ platformId: ctxTwo.platform.id })
            await db.save('api_key', [mockKeyOne, mockKeyTwo])

            const response = await ctxOne.get('/v1/api-keys')

            const responseBody = response?.json()
            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(responseBody.data).toHaveLength(1)
            expect(responseBody.data[0].id).toBe(mockKeyOne.id)
            expect(responseBody.data[0].hashedValue).toBeUndefined()
        })
    })

    describe('Expiry', () => {
        it('rejects a future-dated create request with a non-future expiresAt', async () => {
            const ctx = await createTestContext(app!)

            const response = await ctx.post('/v1/api-keys', {
                displayName: faker.lorem.word(),
                expiresAt: new Date(Date.now() - 60_000).toISOString(),
            })

            expect(response?.statusCode).toBe(StatusCodes.BAD_REQUEST)
        })

        it('creates a key with a future expiresAt and it authenticates until expiry', async () => {
            const ctx = await createTestContext(app!)

            const response = await ctx.post('/v1/api-keys', {
                displayName: faker.lorem.word(),
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            const responseBody = response?.json()

            const authenticatedResponse = await app?.inject({
                method: 'GET',
                url: `/api/v1/platforms/${ctx.platform.id}`,
                headers: { authorization: `Bearer ${responseBody.value}` },
            })
            expect(authenticatedResponse?.statusCode).toBe(StatusCodes.OK)
        })

        it('rejects authentication once an api key has expired', async () => {
            const { mockPlatform } = await mockAndSaveBasicSetup()
            const mockApiKey = createMockApiKey({
                platformId: mockPlatform.id,
                expiresAt: new Date(Date.now() - 60_000).toISOString(),
            })
            await db.save('api_key', mockApiKey)

            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/platforms/${mockPlatform.id}`,
                headers: { authorization: `Bearer ${mockApiKey.value}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.UNAUTHORIZED)
        })

        it('getByValue returns null (never updates lastUsedAt) for an expired key', async () => {
            const { mockPlatform } = await mockAndSaveBasicSetup()
            const mockApiKey = createMockApiKey({
                platformId: mockPlatform.id,
                expiresAt: new Date(Date.now() - 60_000).toISOString(),
            })
            await db.save('api_key', mockApiKey)

            const result = await apiKeyService.getByValue(mockApiKey.value)

            expect(result).toBeNull()
            const stored = await db.findOneByOrFail<{ lastUsedAt: string | null }>('api_key', { id: mockApiKey.id })
            expect(stored.lastUsedAt).toBeNull()
        })

        it('a key with no expiresAt keeps authenticating (zero setup, opt-in only)', async () => {
            const { mockPlatform } = await mockAndSaveBasicSetup()
            const mockApiKey = createMockApiKey({
                platformId: mockPlatform.id,
                expiresAt: null,
            })
            await db.save('api_key', mockApiKey)

            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/platforms/${mockPlatform.id}`,
                headers: { authorization: `Bearer ${mockApiKey.value}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
        })
    })

    describe('Rotation', () => {
        it('rotate mints a working replacement and keeps the old key alive within the grace period', async () => {
            const ctx = await createTestContext(app!)
            const createResponse = await ctx.post('/v1/api-keys', {
                displayName: faker.lorem.word(),
            })
            const original = createResponse?.json()

            const rotateResponse = await ctx.post(`/v1/api-keys/${original.id}/rotate`)
            expect(rotateResponse?.statusCode).toBe(StatusCodes.CREATED)
            const rotated = rotateResponse?.json()

            expect(rotated.id).not.toBe(original.id)
            expect(rotated.value).not.toBe(original.value)
            expect(rotated.value).toContain('sk-')

            const oldKeyStillWorks = await app?.inject({
                method: 'GET',
                url: `/api/v1/platforms/${ctx.platform.id}`,
                headers: { authorization: `Bearer ${original.value}` },
            })
            expect(oldKeyStillWorks?.statusCode).toBe(StatusCodes.OK)

            const newKeyWorks = await app?.inject({
                method: 'GET',
                url: `/api/v1/platforms/${ctx.platform.id}`,
                headers: { authorization: `Bearer ${rotated.value}` },
            })
            expect(newKeyWorks?.statusCode).toBe(StatusCodes.OK)

            const storedOldKey = await db.findOneByOrFail<{ expiresAt: string | null }>('api_key', { id: original.id })
            expect(storedOldKey.expiresAt).not.toBeNull()
            expect(new Date(storedOldKey.expiresAt as string).getTime()).toBeGreaterThan(Date.now())
        })

        it('rotate never pushes expiresAt further out than a key already had', async () => {
            const { mockPlatform } = await mockAndSaveBasicSetup()
            const tightExpiry = new Date(Date.now() + 30_000).toISOString()
            const mockApiKey = createMockApiKey({
                platformId: mockPlatform.id,
                expiresAt: tightExpiry,
            })
            await db.save('api_key', mockApiKey)

            const rotated = await eeApiKeyService.rotate({ id: mockApiKey.id, platformId: mockPlatform.id })
            expect(rotated.id).not.toBe(mockApiKey.id)

            const storedOldKey = await db.findOneByOrFail<{ expiresAt: string | null }>('api_key', { id: mockApiKey.id })
            expect(storedOldKey.expiresAt).toBe(tightExpiry)
        })
    })

    describe('Audit trail', () => {
        it('records an apiKey.created audit on create', async () => {
            const ctx = await createTestContext(app!)
            const auditSpy = vi.spyOn(wideEvent, 'audit')

            const response = await ctx.post('/v1/api-keys', {
                displayName: faker.lorem.word(),
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            const created = response?.json()
            expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
                action: 'apiKey.created',
                actor: expect.objectContaining({ type: 'user' }),
                target: expect.objectContaining({ type: 'apiKey', id: created.id, platformId: ctx.platform.id }),
            }))
        })

        it('records an apiKey.revoked audit on delete', async () => {
            const ctx = await createTestContext(app!)
            const createResponse = await ctx.post('/v1/api-keys', {
                displayName: faker.lorem.word(),
            })
            const created = createResponse?.json()

            const auditSpy = vi.spyOn(wideEvent, 'audit')
            const response = await ctx.delete(`/v1/api-keys/${created.id}`)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
                action: 'apiKey.revoked',
                target: expect.objectContaining({ type: 'apiKey', id: created.id }),
            }))
        })

        it('records an apiKey.rotated audit on rotate', async () => {
            const ctx = await createTestContext(app!)
            const createResponse = await ctx.post('/v1/api-keys', {
                displayName: faker.lorem.word(),
            })
            const created = createResponse?.json()

            const auditSpy = vi.spyOn(wideEvent, 'audit')
            const response = await ctx.post(`/v1/api-keys/${created.id}/rotate`)

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
                action: 'apiKey.rotated',
                target: expect.objectContaining({ type: 'apiKey', id: created.id }),
            }))
        })
    })
})
