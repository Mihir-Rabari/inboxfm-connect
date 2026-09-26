import { apId } from '@inboxfm-connect/core-utils'
import { PieceMetadataModelSummary } from '@inboxfm-connect/pieces-framework'
import { DefaultProjectRole, PackageType, PieceType, PrincipalType } from '@inboxfm-connect/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { pieceCache } from '../../../../src/app/pieces/metadata/piece-cache'
import { pieceMetadataService } from '../../../../src/app/pieces/metadata/piece-metadata-service'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import {
    createMockPieceMetadata,
} from '../../../helpers/mocks'
import { createMemberContext, createTestContext } from '../../../helpers/test-context'
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

beforeEach(async () => {
    await databaseConnection().getRepository('integration_metadata').createQueryBuilder().delete().execute()
    // Truncating the table clears only one of the two layers the list endpoint reads:
    // pieceListCache lives in Redis and would otherwise serve the previous test's rows.
    await pieceCache(mockLog).invalidate()
})

describe('Piece Metadata CE API', () => {
    describe('GET /v1/integrations/categories', () => {
        it('should return piece categories', async () => {
            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/integrations/categories',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(Array.isArray(body)).toBe(true)
        })
    })

    describe('GET /v1/integrations (List)', () => {
        it('should list pieces', async () => {
            const mockPiece = createMockPieceMetadata({
                name: 'ce-list-test-piece',
                pieceType: PieceType.OFFICIAL,
                displayName: 'CE List Test',
                packageType: PackageType.REGISTRY,
            })
            await db.save('integration_metadata', mockPiece)
            await pieceCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/integrations',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(Array.isArray(body.data)).toBe(true)
            // The endpoint merges the shipped local catalog with the DB (fetchLatestPieces),
            // so the seeded piece is listed alongside the catalog rather than alone.
            expect(body.data.map((piece: PieceMetadataModelSummary) => piece.name)).toContain('ce-list-test-piece')
        })

        it('should filter pieces by searchQuery', async () => {
            const mockPieceA = createMockPieceMetadata({
                name: 'searchable-unique-piece',
                pieceType: PieceType.OFFICIAL,
                displayName: 'Searchable Unique Piece',
                packageType: PackageType.REGISTRY,
            })
            const mockPieceB = createMockPieceMetadata({
                name: 'other-piece-xyz',
                pieceType: PieceType.OFFICIAL,
                displayName: 'Other Piece XYZ',
                packageType: PackageType.REGISTRY,
            })
            await db.save('integration_metadata', [mockPieceA, mockPieceB])
            await pieceCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/integrations?searchQuery=Searchable+Unique',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            // The endpoint merges the shipped local catalog with the DB (fetchLatestPieces), so a
            // loose token match against the ~700 real pieces can't be ruled out — assert the search
            // surfaced the target and excluded the unrelated mock, not an exact result count.
            const names = body.data.map((piece: PieceMetadataModelSummary) => piece.name)
            expect(names).toContain('searchable-unique-piece')
            expect(names).not.toContain('other-piece-xyz')
        })

        it('should paginate pieces with limit and cursor', async () => {
            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const page1Response = await app?.inject({
                method: 'GET',
                url: '/api/v1/integrations?limit=2',
                headers: { authorization: `Bearer ${testToken}` },
            })
            expect(page1Response?.statusCode).toBe(StatusCodes.OK)
            const page1 = page1Response?.json()
            expect(page1.data.length).toBe(2)
            expect(page1.next).not.toBeNull()

            const page2Response = await app?.inject({
                method: 'GET',
                url: `/api/v1/integrations?limit=2&cursor=${encodeURIComponent(page1.next)}`,
                headers: { authorization: `Bearer ${testToken}` },
            })
            expect(page2Response?.statusCode).toBe(StatusCodes.OK)
            const page2 = page2Response?.json()
            expect(page2.data.length).toBe(2)
            expect(page2.data[0].name).not.toBe(page1.data[0].name)
        })

        it('should navigate back with the previous cursor', async () => {
            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const page1 = (await app?.inject({
                method: 'GET',
                url: '/api/v1/integrations?limit=2',
                headers: { authorization: `Bearer ${testToken}` },
            }))?.json()
            const page2 = (await app?.inject({
                method: 'GET',
                url: `/api/v1/integrations?limit=2&cursor=${encodeURIComponent(page1.next)}`,
                headers: { authorization: `Bearer ${testToken}` },
            }))?.json()
            expect(page2.previous).not.toBeNull()

            const backResponse = await app?.inject({
                method: 'GET',
                url: `/api/v1/integrations?limit=2&cursor=${encodeURIComponent(page2.previous)}`,
                headers: { authorization: `Bearer ${testToken}` },
            })
            expect(backResponse?.statusCode).toBe(StatusCodes.OK)
            const back = backResponse?.json()
            expect(back.data.map((piece: PieceMetadataModelSummary) => piece.name)).toEqual(
                page1.data.map((piece: PieceMetadataModelSummary) => piece.name),
            )
        })

        it('should return an empty page with null cursors when nothing matches', async () => {
            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/integrations?limit=10&searchQuery=zzz-no-such-piece-qwerty-999',
                headers: { authorization: `Bearer ${testToken}` },
            })
            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.data).toEqual([])
            expect(body.next).toBeNull()
            expect(body.previous).toBeNull()
        })

        it('should fall back to the first page for an invalid cursor', async () => {
            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const page1 = (await app?.inject({
                method: 'GET',
                url: '/api/v1/integrations?limit=2',
                headers: { authorization: `Bearer ${testToken}` },
            }))?.json()

            const response = await app?.inject({
                method: 'GET',
                url: `/api/v1/integrations?limit=2&cursor=${encodeURIComponent('!!!not-a-cursor!!!')}`,
                headers: { authorization: `Bearer ${testToken}` },
            })
            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.data.map((piece: PieceMetadataModelSummary) => piece.name)).toEqual(
                page1.data.map((piece: PieceMetadataModelSummary) => piece.name),
            )
        })

        it('should honor a limit of one', async () => {
            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/integrations?limit=1',
                headers: { authorization: `Bearer ${testToken}` },
            })
            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.data.length).toBe(1)
            expect(body.next).not.toBeNull()
            expect(body.previous).toBeNull()
        })
    })

    describe('GET /v1/integrations/:name', () => {
        it('should get piece by name', async () => {
            const mockPiece = createMockPieceMetadata({
                name: 'ce-get-test-piece',
                pieceType: PieceType.OFFICIAL,
                displayName: 'CE Get Test',
                packageType: PackageType.REGISTRY,
            })
            await db.save('integration_metadata', mockPiece)
            await pieceCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/integrations/ce-get-test-piece',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.name).toBe('ce-get-test-piece')
            expect(body.displayName).toBe('CE Get Test')
        })

        it('should return 404 for non-existent piece', async () => {
            await pieceCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })

            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/integrations/non-existent-piece-xyz',
                headers: {
                    authorization: `Bearer ${testToken}`,
                },
            })

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('GET /v1/integrations/:scope/:name', () => {
        it('should get piece by scope and name', async () => {
            const ctx = await createTestContext(app!)

            const mockPiece = createMockPieceMetadata({
                name: '@inboxfm-connect/ce-scoped-piece',
                pieceType: PieceType.OFFICIAL,
                displayName: 'CE Scoped Test',
                packageType: PackageType.REGISTRY,
            })
            await db.save('integration_metadata', mockPiece)
            await pieceCache(mockLog).setup()

            const response = await ctx.get(`/v1/integrations/@inboxfm-connect/ce-scoped-piece?projectId=${ctx.project.id}`)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response?.json()
            expect(body.name).toBe('@inboxfm-connect/ce-scoped-piece')
        })
    })

    describe('POST /v1/integrations/sync', () => {
        it('should sync pieces as platform admin', async () => {
            const ctx = await createTestContext(app!)

            const response = await ctx.post('/v1/integrations/sync', {})

            // Sync should succeed (200) or be accepted
            expect([StatusCodes.OK, StatusCodes.NO_CONTENT]).toContain(response?.statusCode)
        })
    })

    describe('release-compatibility fallback', () => {
        it('GET /v1/integrations/:scope/:name falls back to the newest compatible version when latest requires a newer release', async () => {
            const compatible = createMockPieceMetadata({
                name: '@inboxfm-connect/piece-release-test',
                pieceType: PieceType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.32',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            const incompatible = createMockPieceMetadata({
                name: '@inboxfm-connect/piece-release-test',
                pieceType: PieceType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.33',
                minimumSupportedRelease: '99.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            await db.save('integration_metadata', [compatible, incompatible])
            await pieceCache(mockLog).setup()

            const ctx = await createTestContext(app!)
            const response = await ctx.get('/v1/integrations/@inboxfm-connect/piece-release-test')

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(response?.json().version).toBe('0.1.32')
        })

        it('GET /v1/integrations returns the newest compatible version in list when latest is incompatible', async () => {
            const compatible = createMockPieceMetadata({
                name: 'list-release-test-piece',
                pieceType: PieceType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.32',
                minimumSupportedRelease: '0.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            const incompatible = createMockPieceMetadata({
                name: 'list-release-test-piece',
                pieceType: PieceType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.33',
                minimumSupportedRelease: '99.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            await db.save('integration_metadata', [compatible, incompatible])
            await pieceCache(mockLog).setup()

            const testToken = await generateMockToken({
                type: PrincipalType.UNKNOWN,
                id: apId(),
            })
            const response = await app?.inject({
                method: 'GET',
                url: '/api/v1/integrations',
                headers: { authorization: `Bearer ${testToken}` },
            })

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const entry = response?.json().data.find((p: { name: string }) => p.name === 'list-release-test-piece')
            expect(entry).toBeDefined()
            expect(entry.version).toBe('0.1.32')
        })

        it('GET /v1/integrations/:scope/:name returns 404 when all versions are incompatible', async () => {
            const incompatible = createMockPieceMetadata({
                name: '@inboxfm-connect/piece-all-incompatible',
                pieceType: PieceType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                version: '0.1.33',
                minimumSupportedRelease: '99.0.0',
                maximumSupportedRelease: '99999.99999.9999',
            })
            await db.save('integration_metadata', incompatible)
            await pieceCache(mockLog).setup()

            const ctx = await createTestContext(app!)
            const response = await ctx.get('/v1/integrations/@inboxfm-connect/piece-all-incompatible')

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('DELETE /v1/integrations/:id', () => {
        it('should delete a custom piece owned by the platform', async () => {
            const ctx = await createTestContext(app!)
            const mockPiece = createMockPieceMetadata({
                name: '@custom/deletable-piece',
                pieceType: PieceType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId: ctx.platform.id,
                version: '0.1.0',
            })
            await db.save('integration_metadata', mockPiece)
            await pieceCache(mockLog).setup()

            const response = await ctx.delete(`/v1/integrations/${mockPiece.id}`)

            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
            const remaining = await databaseConnection().getRepository('integration_metadata').findOneBy({ id: mockPiece.id })
            expect(remaining).toBeNull()
        })

        it('should return 404 for a non-existent piece id', async () => {
            const ctx = await createTestContext(app!)
            await pieceCache(mockLog).setup()

            const response = await ctx.delete(`/v1/integrations/${apId()}`)

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })

        it('should delete all versions of the custom piece', async () => {
            const ctx = await createTestContext(app!)
            const versionOne = createMockPieceMetadata({
                name: '@custom/multi-version-piece',
                pieceType: PieceType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId: ctx.platform.id,
                version: '0.1.0',
            })
            const versionTwo = createMockPieceMetadata({
                name: '@custom/multi-version-piece',
                pieceType: PieceType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId: ctx.platform.id,
                version: '0.2.0',
            })
            await db.save('integration_metadata', [versionOne, versionTwo])
            await pieceCache(mockLog).setup()

            const response = await ctx.delete(`/v1/integrations/${versionTwo.id}`)

            expect(response?.statusCode).toBe(StatusCodes.NO_CONTENT)
            const remaining = await databaseConnection().getRepository('integration_metadata').findBy({ name: '@custom/multi-version-piece' })
            expect(remaining).toHaveLength(0)
        })

        it('should reject deleting a platform-owned official piece with 403', async () => {
            const ctx = await createTestContext(app!)
            const mockPiece = createMockPieceMetadata({
                name: '@inboxfm-connect/official-piece',
                pieceType: PieceType.OFFICIAL,
                packageType: PackageType.REGISTRY,
                platformId: ctx.platform.id,
                version: '0.1.0',
            })
            await db.save('integration_metadata', mockPiece)
            await pieceCache(mockLog).setup()

            const response = await ctx.delete(`/v1/integrations/${mockPiece.id}`)

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
            const remaining = await databaseConnection().getRepository('integration_metadata').findOneBy({ id: mockPiece.id })
            expect(remaining).not.toBeNull()
        })

        it('should reject deletion by a non-admin platform member with 403', async () => {
            const ownerCtx = await createTestContext(app!)
            const memberCtx = await createMemberContext(app!, ownerCtx, {
                projectRole: DefaultProjectRole.EDITOR,
            })
            const mockPiece = createMockPieceMetadata({
                name: '@custom/member-cannot-delete',
                pieceType: PieceType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId: ownerCtx.platform.id,
                version: '0.1.0',
            })
            await db.save('integration_metadata', mockPiece)
            await pieceCache(mockLog).setup()

            const response = await memberCtx.delete(`/v1/integrations/${mockPiece.id}`)

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
            const remaining = await databaseConnection().getRepository('integration_metadata').findOneBy({ id: mockPiece.id })
            expect(remaining).not.toBeNull()
        })

        it('should not delete a custom piece owned by another platform', async () => {
            const ctx = await createTestContext(app!)
            const mockPiece = createMockPieceMetadata({
                name: '@custom/other-platform-piece',
                pieceType: PieceType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId: apId(),
                version: '0.1.0',
            })
            await db.save('integration_metadata', mockPiece)
            await pieceCache(mockLog).setup()

            const response = await ctx.delete(`/v1/integrations/${mockPiece.id}`)

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
            const remaining = await databaseConnection().getRepository('integration_metadata').findOneBy({ id: mockPiece.id })
            expect(remaining).not.toBeNull()
        })

        // REMOVED: three "delete custom piece blocked/allowed by a flow that uses it"
        // cases. Production `pieceMetadataService.delete` no longer consults flows at
        // all (the flow/flow_version tables and the in-use 409 check were deleted with
        // the Flow Runtime) � it simply deletes the custom piece. The cases depended on
        // the removed createMockFlow/createMockFlowVersion mocks and FlowTriggerType.
    })

    describe('pieceMetadataService.get() — custom pieces', () => {
        it('should return undefined for custom piece when platformId is not provided', async () => {
            const platformId = apId()
            const mockPiece = createMockPieceMetadata({
                name: '@custom/my-piece',
                pieceType: PieceType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId,
                version: '0.1.0',
            })
            await db.save('integration_metadata', mockPiece)
            await pieceCache(mockLog).setup()

            const result = await pieceMetadataService(mockLog).get({
                name: '@custom/my-piece',
                version: '0.1.0',
            })
            expect(result).toBeUndefined()
        })

        it('should return custom piece when platformId is provided', async () => {
            const platformId = apId()
            const mockPiece = createMockPieceMetadata({
                name: '@custom/my-piece',
                pieceType: PieceType.CUSTOM,
                packageType: PackageType.REGISTRY,
                platformId,
                version: '0.1.0',
            })
            await db.save('integration_metadata', mockPiece)
            await pieceCache(mockLog).setup()

            const result = await pieceMetadataService(mockLog).get({
                name: '@custom/my-piece',
                version: '0.1.0',
                platformId,
            })
            expect(result).toBeDefined()
            expect(result?.name).toBe('@custom/my-piece')
        })
    })
})
