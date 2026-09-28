import {
    AppConnectionStatus,
    AppConnectionType,
    ConnectionHealthStatus,
    EngineResponseStatus,
    PackageType,
} from '@inboxfm-connect/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { userInteractionWatcher } from '../../../../src/app/helper/user-interaction/user-interaction-watcher'
import { pieceMetadataService } from '../../../../src/app/pieces/metadata/piece-metadata-service'
import { db } from '../../../helpers/db'
import { createMockPieceMetadata } from '../../../helpers/mocks'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null
let mockLog: FastifyBaseLogger

beforeAll(async () => {
    app = await setupTestEnvironment()
    mockLog = app!.log!
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Test Connection (Health Check) API', () => {
    it('successfully tests a healthy connection and returns structured health check response', async () => {
        const ctx = await createTestContext(app!)

        const mockPieceMetadata = createMockPieceMetadata({
            platformId: ctx.platform.id,
            packageType: PackageType.REGISTRY,
        })
        await db.save('integration_metadata', mockPieceMetadata)
        pieceMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPieceMetadata)

        // Mock engine validation returning valid: true
        userInteractionWatcher.submitAndWaitForResponse = vi.fn().mockResolvedValue({
            status: EngineResponseStatus.OK,
            response: { valid: true },
        })

        const createResponse = await ctx.post('/v1/connections', {
            externalId: 'test-healthy-conn',
            displayName: 'Healthy Connection',
            pieceName: mockPieceMetadata.name,
            projectId: ctx.project.id,
            type: AppConnectionType.SECRET_TEXT,
            value: {
                type: AppConnectionType.SECRET_TEXT,
                secret_text: 'my-secret-key-12345',
            },
            pieceVersion: mockPieceMetadata.version,
        })

        expect(createResponse?.statusCode).toBe(StatusCodes.CREATED)
        const connection = createResponse?.json()

        const testResponse = await ctx.post(`/v1/connections/${connection.id}/test`, {})

        expect(testResponse?.statusCode).toBe(StatusCodes.OK)
        const result = testResponse?.json()
        expect(result.success).toBe(true)
        expect(result.status).toBe(ConnectionHealthStatus.HEALTHY)
        expect(result.message).toContain('healthy')
        expect(typeof result.responseTimeMs).toBe('number')
        expect(typeof result.testedAt).toBe('string')

        // Ensure secrets are never exposed in response
        const rawJson = JSON.stringify(result)
        expect(rawJson).not.toContain('my-secret-key-12345')
        expect(rawJson).not.toContain('secret_text')
    })

    it('returns AUTH_INVALID status when credentials fail validation', async () => {
        const ctx = await createTestContext(app!)

        const mockPieceMetadata = createMockPieceMetadata({
            platformId: ctx.platform.id,
            packageType: PackageType.REGISTRY,
        })
        await db.save('integration_metadata', mockPieceMetadata)
        pieceMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPieceMetadata)

        // Mock engine validation returning valid: false
        userInteractionWatcher.submitAndWaitForResponse = vi.fn().mockResolvedValue({
            status: EngineResponseStatus.OK,
            response: { valid: false, error: 'Invalid API Key or unauthorized 401' },
        })

        const createResponse = await ctx.post('/v1/connections', {
            externalId: 'test-invalid-conn',
            displayName: 'Invalid Connection',
            pieceName: mockPieceMetadata.name,
            projectId: ctx.project.id,
            type: AppConnectionType.SECRET_TEXT,
            value: {
                type: AppConnectionType.SECRET_TEXT,
                secret_text: 'bad-secret',
            },
            pieceVersion: mockPieceMetadata.version,
        })

        const connection = createResponse?.json()

        const testResponse = await ctx.post(`/v1/connections/${connection.id}/test`, {})

        expect(testResponse?.statusCode).toBe(StatusCodes.OK)
        const result = testResponse?.json()
        expect(result.success).toBe(false)
        expect(result.status).toBe(ConnectionHealthStatus.AUTH_INVALID)
        expect(result.message).toContain('Invalid API Key')

        // Connection status in database should be updated to ERROR
        const getConnResponse = await ctx.get(`/v1/connections/${connection.id}`)
        expect(getConnResponse?.json().status).toBe(AppConnectionStatus.ERROR)
    })

    it('returns AUTH_EXPIRED status when token is expired', async () => {
        const ctx = await createTestContext(app!)

        const mockPieceMetadata = createMockPieceMetadata({
            platformId: ctx.platform.id,
            packageType: PackageType.REGISTRY,
        })
        await db.save('integration_metadata', mockPieceMetadata)
        pieceMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPieceMetadata)

        userInteractionWatcher.submitAndWaitForResponse = vi.fn().mockResolvedValue({
            status: EngineResponseStatus.OK,
            response: { valid: false, error: 'Access token expired' },
        })

        const createResponse = await ctx.post('/v1/connections', {
            externalId: 'test-expired-conn',
            displayName: 'Expired Connection',
            pieceName: mockPieceMetadata.name,
            projectId: ctx.project.id,
            type: AppConnectionType.SECRET_TEXT,
            value: {
                type: AppConnectionType.SECRET_TEXT,
                secret_text: 'expired-token',
            },
            pieceVersion: mockPieceMetadata.version,
        })

        const connection = createResponse?.json()
        const testResponse = await ctx.post(`/v1/connections/${connection.id}/test`, {})

        expect(testResponse?.statusCode).toBe(StatusCodes.OK)
        const result = testResponse?.json()
        expect(result.success).toBe(false)
        expect(result.status).toBe(ConnectionHealthStatus.AUTH_EXPIRED)
    })

    it('returns INSUFFICIENT_PERMISSION status when permission or scope is denied', async () => {
        const ctx = await createTestContext(app!)

        const mockPieceMetadata = createMockPieceMetadata({
            platformId: ctx.platform.id,
            packageType: PackageType.REGISTRY,
        })
        await db.save('integration_metadata', mockPieceMetadata)
        pieceMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPieceMetadata)

        userInteractionWatcher.submitAndWaitForResponse = vi.fn().mockResolvedValue({
            status: EngineResponseStatus.OK,
            response: { valid: false, error: 'Forbidden 403: insufficient_scope for action' },
        })

        const createResponse = await ctx.post('/v1/connections', {
            externalId: 'test-scope-conn',
            displayName: 'Scope Connection',
            pieceName: mockPieceMetadata.name,
            projectId: ctx.project.id,
            type: AppConnectionType.SECRET_TEXT,
            value: {
                type: AppConnectionType.SECRET_TEXT,
                secret_text: 'token',
            },
            pieceVersion: mockPieceMetadata.version,
        })

        const connection = createResponse?.json()
        const testResponse = await ctx.post(`/v1/connections/${connection.id}/test`, {})

        expect(testResponse?.statusCode).toBe(StatusCodes.OK)
        const result = testResponse?.json()
        expect(result.success).toBe(false)
        expect(result.status).toBe(ConnectionHealthStatus.INSUFFICIENT_PERMISSION)
    })

    it('returns RATE_LIMITED status when provider returns rate limit error', async () => {
        const ctx = await createTestContext(app!)

        const mockPieceMetadata = createMockPieceMetadata({
            platformId: ctx.platform.id,
            packageType: PackageType.REGISTRY,
        })
        await db.save('integration_metadata', mockPieceMetadata)
        pieceMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPieceMetadata)

        userInteractionWatcher.submitAndWaitForResponse = vi.fn().mockResolvedValue({
            status: EngineResponseStatus.OK,
            response: { valid: false, error: '429 Too Many Requests - rate limit exceeded' },
        })

        const createResponse = await ctx.post('/v1/connections', {
            externalId: 'test-ratelimit-conn',
            displayName: 'Rate Limited Connection',
            pieceName: mockPieceMetadata.name,
            projectId: ctx.project.id,
            type: AppConnectionType.SECRET_TEXT,
            value: {
                type: AppConnectionType.SECRET_TEXT,
                secret_text: 'token',
            },
            pieceVersion: mockPieceMetadata.version,
        })

        const connection = createResponse?.json()
        const testResponse = await ctx.post(`/v1/connections/${connection.id}/test`, {})

        expect(testResponse?.statusCode).toBe(StatusCodes.OK)
        const result = testResponse?.json()
        expect(result.success).toBe(false)
        expect(result.status).toBe(ConnectionHealthStatus.RATE_LIMITED)
    })

    it('returns NETWORK_ERROR status when connection test times out', async () => {
        const ctx = await createTestContext(app!)

        const mockPieceMetadata = createMockPieceMetadata({
            platformId: ctx.platform.id,
            packageType: PackageType.REGISTRY,
        })
        await db.save('integration_metadata', mockPieceMetadata)
        pieceMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPieceMetadata)

        // Mock engine validation timing out
        userInteractionWatcher.submitAndWaitForResponse = vi.fn().mockResolvedValue({
            status: EngineResponseStatus.TIMEOUT,
        })

        const createResponse = await ctx.post('/v1/connections', {
            externalId: 'test-timeout-conn',
            displayName: 'Timeout Connection',
            pieceName: mockPieceMetadata.name,
            projectId: ctx.project.id,
            type: AppConnectionType.SECRET_TEXT,
            value: {
                type: AppConnectionType.SECRET_TEXT,
                secret_text: 'secret',
            },
            pieceVersion: mockPieceMetadata.version,
        })

        const connection = createResponse?.json()

        const testResponse = await ctx.post(`/v1/connections/${connection.id}/test`, {})

        expect(testResponse?.statusCode).toBe(StatusCodes.OK)
        const result = testResponse?.json()
        expect(result.success).toBe(false)
        expect(result.status).toBe(ConnectionHealthStatus.NETWORK_ERROR)
        expect(result.message).toContain('timed out')
    })

    it('returns 404 for non-existent connection', async () => {
        const ctx = await createTestContext(app!)

        const testResponse = await ctx.post('/v1/connections/non-existent-id/test', {})
        expect(testResponse?.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('supports NO_AUTH connections as instantly healthy', async () => {
        const ctx = await createTestContext(app!)

        const mockPieceMetadata = createMockPieceMetadata({
            platformId: ctx.platform.id,
            packageType: PackageType.REGISTRY,
        })
        await db.save('integration_metadata', mockPieceMetadata)
        pieceMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPieceMetadata)

        const createResponse = await ctx.post('/v1/connections', {
            externalId: 'test-noauth-conn',
            displayName: 'No Auth Connection',
            pieceName: mockPieceMetadata.name,
            projectId: ctx.project.id,
            type: AppConnectionType.NO_AUTH,
            value: {
                type: AppConnectionType.NO_AUTH,
            },
            pieceVersion: mockPieceMetadata.version,
        })

        const connection = createResponse?.json()

        const testResponse = await ctx.post(`/v1/connections/${connection.id}/test`, {})

        expect(testResponse?.statusCode).toBe(StatusCodes.OK)
        const result = testResponse?.json()
        expect(result.success).toBe(true)
        expect(result.status).toBe(ConnectionHealthStatus.HEALTHY)
    })
})

