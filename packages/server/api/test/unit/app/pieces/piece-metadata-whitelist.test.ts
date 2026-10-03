import { PackageType, PieceCategory, PieceType } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Security regression (issue #478): pieceMetadataService.create() spread the caller's metadata
// object LAST, over every server-pinned column:
//
//   save({ id: apId(), packageType, pieceType, archiveId, platformId, created, ...pieceMetadata })
//
// For an archive install that object comes from the engine running the uploaded archive's
// JavaScript. Nothing validates it: `extractPieceInformation` returns
// `EngineResponse<PieceMetadata>` off a generic type assertion, and the engine's
// `extractPieceFromModule` only checks that some exported value's constructor.name is
// 'Integration'/'Piece'. So a crafted archive controls every key.
//
// The reported impact: `metadata()` returning `platformId: null` + `pieceType: 'OFFICIAL'`
// persisted a NULL-platformId OFFICIAL row - the shared global catalog every tenant's listing
// and version resolution picks up, and one `delete()` can never match because that requires
// the row's platformId to equal the caller's.
//
// The fix whitelists the archive-controlled keys and assigns the pinned columns after the
// spread. These tests assert the *persisted row*, not the call shape.

const mockFindOneBy = vi.fn()
const mockSave = vi.fn()
const mockFindOne = vi.fn()

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => ({
        findOneBy: mockFindOneBy,
        findOne: mockFindOne,
        save: mockSave,
        createQueryBuilder: () => ({ insert: vi.fn() }),
    }),
}))

const mockCacheInvalidate = vi.fn()

vi.mock('../../../../src/app/pieces/metadata/piece-cache', () => ({
    pieceCache: () => ({ invalidate: mockCacheInvalidate }),
    PieceRegistryEntry: {},
}))

vi.mock('../../../../src/app/database/redis-connections', () => ({
    distributedLock: () => ({ runExclusive: ({ fn }: { fn: () => Promise<unknown> }) => fn() }),
}))

const mockLog: FastifyBaseLogger = {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    fatal: vi.fn(), trace: vi.fn(), child: vi.fn(), silent: vi.fn(),
    level: 'info',
} as unknown as FastifyBaseLogger

async function loadService() {
    const mod = await import('../../../../src/app/pieces/metadata/piece-metadata-service')
    return mod.pieceMetadataService(mockLog)
}

const PLATFORM_ID = 'platform-abc'

// A crafted archive's answer: honest content keys, hostile ownership keys.
const CRAFTED_METADATA = {
    name: 'evil-piece',
    version: '1.0.0',
    displayName: 'Totally Legit',
    logoUrl: 'https://example.com/logo.svg',
    description: 'a helpful piece',
    authors: ['someone'],
    categories: [PieceCategory.UTILITY],
    // Everything below is the attack surface.
    platformId: null,
    pieceType: 'OFFICIAL',
    packageType: 'REGISTRY',
    archiveId: 'attacker-archive',
    id: 'attacker-chosen-id',
    created: '1999-01-01T00:00:00.000Z',
} as unknown as Parameters<Awaited<ReturnType<typeof loadService>>['create']>[0]['pieceMetadata']

async function createWith(service: Awaited<ReturnType<typeof loadService>>, metadata: typeof CRAFTED_METADATA) {
    return service.create({
        pieceMetadata: metadata,
        packageType: PackageType.ARCHIVE,
        platformId: PLATFORM_ID,
        pieceType: PieceType.CUSTOM,
        archiveId: 'server-archive-id',
        publishCacheRefresh: false,
    })
}

describe('pieceMetadataService.create archive-controlled columns (#478)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockFindOneBy.mockResolvedValue(null)
        mockFindOne.mockResolvedValue({ created: '2026-01-01T00:00:00.000Z' })
        mockSave.mockImplementation(async (entity) => ({ id: 'generated-id', ...entity }))
        mockCacheInvalidate.mockResolvedValue(undefined)
    })

    it('ignores an archive-supplied platformId', async () => {
        const service = await loadService()
        await createWith(service, CRAFTED_METADATA)

        const [saved] = mockSave.mock.calls[0]
        // The exact assertion from the issue's repro: the archive said null, the row must
        // carry the caller's platform.
        expect(saved.platformId).toBe(PLATFORM_ID)
        expect(saved.platformId).not.toBeNull()
    })

    it('ignores an archive-supplied pieceType', async () => {
        const service = await loadService()
        await createWith(service, CRAFTED_METADATA)

        const [saved] = mockSave.mock.calls[0]
        expect(saved.pieceType).toBe(PieceType.CUSTOM)
    })

    it('ignores an archive-supplied packageType and archiveId', async () => {
        const service = await loadService()
        await createWith(service, CRAFTED_METADATA)

        const [saved] = mockSave.mock.calls[0]
        expect(saved.packageType).toBe(PackageType.ARCHIVE)
        expect(saved.archiveId).toBe('server-archive-id')
    })

    it('ignores an archive-supplied primary key', async () => {
        const service = await loadService()
        await createWith(service, CRAFTED_METADATA)

        const [saved] = mockSave.mock.calls[0]
        // findOldestCreatedDate's ordering contract depends on the server owning `id`.
        expect(saved.id).not.toBe('attacker-chosen-id')
        expect(saved.id).toBeTruthy()
    })

    it('ignores an archive-supplied created timestamp', async () => {
        const service = await loadService()
        await createWith(service, CRAFTED_METADATA)

        const [saved] = mockSave.mock.calls[0]
        expect(saved.created).not.toBe('1999-01-01T00:00:00.000Z')
        expect(saved.created).toBe('2026-01-01T00:00:00.000Z')
    })

    it('still persists every archive-controlled content key', async () => {
        // The whitelist must not become a denylist of everything - the whole point of an
        // archive install is that the archive describes its own piece.
        const service = await loadService()
        await createWith(service, CRAFTED_METADATA)

        const [saved] = mockSave.mock.calls[0]
        expect(saved).toMatchObject({
            name: 'evil-piece',
            version: '1.0.0',
            displayName: 'Totally Legit',
            logoUrl: 'https://example.com/logo.svg',
            description: 'a helpful piece',
            authors: ['someone'],
            categories: [PieceCategory.UTILITY],
        })
    })

    it('does not carry a key the entity does not declare', async () => {
        // A spread passes unknown keys straight into the save payload; the whitelist cannot.
        const service = await loadService()
        await createWith(service, {
            ...CRAFTED_METADATA,
            totallyUnknownColumn: 'surprise',
        } as typeof CRAFTED_METADATA)

        const [saved] = mockSave.mock.calls[0]
        expect(saved).not.toHaveProperty('totallyUnknownColumn')
    })
})