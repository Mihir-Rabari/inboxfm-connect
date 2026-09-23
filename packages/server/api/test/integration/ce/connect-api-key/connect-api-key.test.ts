import { faker } from '@faker-js/faker'
import { wideEvent } from '@inboxfm-connect/server-utils'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { connectApiKeyService } from '../../../../src/app/connect-api-keys/connect-api-key.service'
import { db } from '../../../helpers/db'
import {
    createMockConnectApiKey,
    mockAndSaveBasicSetup,
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

describe('Connect API Key API (cak-, available in every edition)', () => {
    describe('Create Connect API Key API', () => {
        it('should create a new Connect API Key scoped to the project', async () => {
            const ctx = await createTestContext(app!)

            const response = await ctx.post('/v1/connect-api-keys', {
                displayName: faker.lorem.word(),
                projectId: ctx.project.id,
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            const responseBody = response?.json()
            expect(responseBody.projectId).toBe(ctx.project.id)
            expect(responseBody.platformId).toBe(ctx.platform.id)
            expect(responseBody.hashedValue).toBeUndefined()
            expect(responseBody.value).toHaveLength(64)
            expect(responseBody.value).toContain('cak-')
        })

        it('rejects a create request with a non-future expiresAt', async () => {
            const ctx = await createTestContext(app!)

            const response = await ctx.post('/v1/connect-api-keys', {
                displayName: faker.lorem.word(),
                projectId: ctx.project.id,
                expiresAt: new Date(Date.now() - 60_000).toISOString(),
            })

            expect(response?.statusCode).toBe(StatusCodes.BAD_REQUEST)
        })
    })

    describe('List Connect API Keys endpoint', () => {
        it('filters keys by project', async () => {
            const ctxOne = await createTestContext(app!)
            const ctxTwo = await createTestContext(app!)

            const mockKeyOne = createMockConnectApiKey({ platformId: ctxOne.platform.id, projectId: ctxOne.project.id })
            const mockKeyTwo = createMockConnectApiKey({ platformId: ctxTwo.platform.id, projectId: ctxTwo.project.id })
            await db.save('connect_api_key', [mockKeyOne, mockKeyTwo])

            const response = await ctxOne.get('/v1/connect-api-keys', { projectId: ctxOne.project.id })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const responseBody = response?.json()
            expect(responseBody.data).toHaveLength(1)
            expect(responseBody.data[0].id).toBe(mockKeyOne.id)
            expect(responseBody.data[0].hashedValue).toBeUndefined()
        })
    })

    describe('Expiry', () => {
        it('a project-scoped connect session can be created with a live cak- key', async () => {
            const { mockPlatform, mockProject } = await mockAndSaveBasicSetup()
            const mockKey = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: mockProject.id })
            await db.save('connect_api_key', mockKey)

            const response = await app?.inject({
                method: 'POST',
                url: '/api/v1/connect-sessions',
                headers: { authorization: `Bearer ${mockKey.value}` },
                payload: { projectId: mockProject.id, externalUserId: 'end-user-1' },
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
        })

        it('rejects authentication once a cak- key has expired', async () => {
            const { mockPlatform, mockProject } = await mockAndSaveBasicSetup()
            const mockKey = createMockConnectApiKey({
                platformId: mockPlatform.id,
                projectId: mockProject.id,
                expiresAt: new Date(Date.now() - 60_000).toISOString(),
            })
            await db.save('connect_api_key', mockKey)

            const response = await app?.inject({
                method: 'POST',
                url: '/api/v1/connect-sessions',
                headers: { authorization: `Bearer ${mockKey.value}` },
                payload: { projectId: mockProject.id, externalUserId: 'end-user-1' },
            })

            expect(response?.statusCode).toBe(StatusCodes.UNAUTHORIZED)
        })

        it('getByValue returns null (never updates lastUsedAt) for an expired key', async () => {
            const { mockPlatform, mockProject } = await mockAndSaveBasicSetup()
            const mockKey = createMockConnectApiKey({
                platformId: mockPlatform.id,
                projectId: mockProject.id,
                expiresAt: new Date(Date.now() - 60_000).toISOString(),
            })
            await db.save('connect_api_key', mockKey)

            const result = await connectApiKeyService.getByValue(mockKey.value)

            expect(result).toBeNull()
            const stored = await db.findOneByOrFail<{ lastUsedAt: string | null }>('connect_api_key', { id: mockKey.id })
            expect(stored.lastUsedAt).toBeNull()
        })
    })

    describe('Rotation', () => {
        it('rotate mints a working replacement and keeps the old key alive within the grace period', async () => {
            const ctx = await createTestContext(app!)
            const createResponse = await ctx.post('/v1/connect-api-keys', {
                displayName: faker.lorem.word(),
                projectId: ctx.project.id,
            })
            const original = createResponse?.json()

            const rotateResponse = await ctx.post(`/v1/connect-api-keys/${original.id}/rotate`)
            expect(rotateResponse?.statusCode).toBe(StatusCodes.CREATED)
            const rotated = rotateResponse?.json()

            expect(rotated.id).not.toBe(original.id)
            expect(rotated.projectId).toBe(ctx.project.id)

            const oldKeyStillWorks = await app?.inject({
                method: 'POST',
                url: '/api/v1/connect-sessions',
                headers: { authorization: `Bearer ${original.value}` },
                payload: { projectId: ctx.project.id, externalUserId: 'end-user-1' },
            })
            expect(oldKeyStillWorks?.statusCode).toBe(StatusCodes.CREATED)

            const newKeyWorks = await app?.inject({
                method: 'POST',
                url: '/api/v1/connect-sessions',
                headers: { authorization: `Bearer ${rotated.value}` },
                payload: { projectId: ctx.project.id, externalUserId: 'end-user-2' },
            })
            expect(newKeyWorks?.statusCode).toBe(StatusCodes.CREATED)

            const storedOldKey = await db.findOneByOrFail<{ expiresAt: string | null }>('connect_api_key', { id: original.id })
            expect(storedOldKey.expiresAt).not.toBeNull()
            expect(new Date(storedOldKey.expiresAt as string).getTime()).toBeGreaterThan(Date.now())
        })
    })

    describe('Audit trail', () => {
        it('records an apiKey.created audit (target type connectApiKey) on create', async () => {
            const ctx = await createTestContext(app!)
            const auditSpy = vi.spyOn(wideEvent, 'audit')

            const response = await ctx.post('/v1/connect-api-keys', {
                displayName: faker.lorem.word(),
                projectId: ctx.project.id,
            })

            expect(response?.statusCode).toBe(StatusCodes.CREATED)
            const created = response?.json()
            expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
                action: 'apiKey.created',
                target: expect.objectContaining({ type: 'connectApiKey', id: created.id, projectId: ctx.project.id }),
            }))
        })

        it('records an apiKey.revoked audit on delete', async () => {
            const ctx = await createTestContext(app!)
            const createResponse = await ctx.post('/v1/connect-api-keys', {
                displayName: faker.lorem.word(),
                projectId: ctx.project.id,
            })
            const created = createResponse?.json()

            const auditSpy = vi.spyOn(wideEvent, 'audit')
            const response = await ctx.delete(`/v1/connect-api-keys/${created.id}`)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
                action: 'apiKey.revoked',
                target: expect.objectContaining({ type: 'connectApiKey', id: created.id }),
            }))
        })
    })
})
