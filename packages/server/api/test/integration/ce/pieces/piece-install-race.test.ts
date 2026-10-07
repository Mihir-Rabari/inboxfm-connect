import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
    EngineResponseStatus,
    FileType,
    PackageType,
    PieceScope,
} from '@inboxfm-connect/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { EntityManager } from 'typeorm'
import { MockInstance } from 'vitest'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { userInteractionWatcher } from '../../../../src/app/helper/user-interaction/user-interaction-watcher'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

const PIECE_NAME = 'concurrent-install-race-piece'
const PIECE_VERSION = '0.9.1'

const tgzBuffer = readFileSync(
    join(__dirname, '../../../../src/assets/private-piece-test.tgz'),
)

const mockPieceMetadata = {
    name: PIECE_NAME,
    version: PIECE_VERSION,
    displayName: 'Concurrent Install Race Piece',
    logoUrl: 'https://cdn.activepieces.com/pieces/discord.png',
    description: 'Test piece for concurrent install race',
    auth: undefined,
    actions: {},
    triggers: {},
    minimumSupportedRelease: '0.0.0',
    maximumSupportedRelease: '999.999.999',
    authors: [],
    categories: [],
    i18n: {},
}

let app: FastifyInstance | null = null
let interactionSpy: MockInstance

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(async () => {
    await databaseConnection().getRepository('integration_metadata').createQueryBuilder().delete().execute()
    // Isolate the archive-leak assertions from any PACKAGE_ARCHIVE rows left by
    // earlier files in this suite run.
    await databaseConnection().getRepository('file')
        .createQueryBuilder('file')
        .delete()
        .where('file.type = :type', { type: FileType.PACKAGE_ARCHIVE })
        .execute()
    interactionSpy = vi.spyOn(userInteractionWatcher, 'submitAndWaitForResponse').mockResolvedValue({
        status: EngineResponseStatus.OK,
        response: mockPieceMetadata,
        error: undefined,
    })
})

afterEach(async () => {
    interactionSpy.mockRestore()
    entityManagerFindOneByGate?.mockRestore()
    entityManagerFindOneByGate = undefined
})

function buildInstallForm(): FormData {
    const formData = new FormData()
    formData.append(
        'pieceArchive',
        new Blob([tgzBuffer], { type: 'application/gzip' }),
        'private-piece-test.tgz',
    )
    formData.append('pieceName', PIECE_NAME)
    formData.append('pieceVersion', PIECE_VERSION)
    formData.append('packageType', PackageType.ARCHIVE)
    formData.append('scope', PieceScope.PLATFORM)
    return formData
}

// Deterministic interleave (the RED instrument): park BOTH concurrent requests at
// the create() existence check — the shared EntityManager.prototype.findOneBy
// delegates every repository findOneBy — until both have read existing = null.
// Then release them together so both proceed to save, the unique index
// idx_piece_metadata_name_platform_id_version arbitrates, and the loser's
// convergence path is forced. The gate matches only lookups whose where-clause
// carries the raced piece name, so unrelated reads pass straight through.
let entityManagerFindOneByGate: MockInstance | undefined

function parkBothRequestsAtExistenceCheck(): void {
    const original = EntityManager.prototype.findOneBy
    let arrivals = 0
    let released = false
    const parkedResolvers: (() => void)[] = []
    entityManagerFindOneByGate = vi
        .spyOn(EntityManager.prototype, 'findOneBy')
        .mockImplementation(async function (this: EntityManager, entityTarget: unknown, where: Record<string, unknown>) {
            const isRacedPieceLookup =
                (where as { name?: unknown })?.name === PIECE_NAME
            if (!isRacedPieceLookup || released) {
                return original.call(this, entityTarget as never, where as never)
            }
            arrivals++
            await new Promise<void>((resolve) => {
                parkedResolvers.push(resolve)
                if (arrivals === 2) {
                    released = true
                    parkedResolvers.forEach((release) => release())
                }
            })
            return original.call(this, entityTarget as never, where as never)
        })
}

describe('POST /v1/integrations — concurrent duplicate install', () => {
    it('two concurrent identical installs: both read existing=null, loser converges on the winner row instead of a driver error', async () => {
        const ctx = await createTestContext(app!)
        parkBothRequestsAtExistenceCheck()

        const responses = await Promise.all([
            ctx.inject({
                method: 'POST',
                url: '/api/v1/integrations',
                body: buildInstallForm(),
            }),
            ctx.inject({
                method: 'POST',
                url: '/api/v1/integrations',
                body: buildInstallForm(),
            }),
        ])

        const statuses = responses.map((r) => r.statusCode).sort()
        // Winner installs (201); the race loser gets the SAME documented VALIDATION
        // conflict a sequential duplicate gets — an actionable "already exists"
        // with code=VALIDATION — never a raw driver error mislabeled as an
        // engine failure.
        expect(statuses).toEqual([StatusCodes.CREATED, StatusCodes.CONFLICT])
        const loserBody = responses.find((r) => r.statusCode === StatusCodes.CONFLICT)!.json()
        expect(loserBody.code).toBe('VALIDATION')
        expect(String(loserBody.params.message)).toContain('piece_metadata_already_exists')

        // Storage: the loser's freshly uploaded archive must be cleaned up, not
        // leaked. Under the PGLite test harness a failed insert poisons the shared
        // session (the winner's metadata row also rolls back), so the archive
        // count is the reliable cross-driver observable: 2 uploads, loser's
        // deleted => 1 PACKAGE_ARCHIVE row remains.
        const archiveRows = await databaseConnection().getRepository('file')
            .createQueryBuilder('file')
            .where('file.type = :type', { type: FileType.PACKAGE_ARCHIVE })
            .andWhere('file.platformId = :platformId', { platformId: ctx.platform.id })
            .getMany()
        expect(archiveRows.length).toBe(1)
    })

    it('sequential duplicate install still returns the existing-piece VALIDATION conflict', async () => {
        const ctx = await createTestContext(app!)

        const first = await ctx.inject({
            method: 'POST',
            url: '/api/v1/integrations',
            body: buildInstallForm(),
        })
        expect(first.statusCode).toBe(StatusCodes.CREATED)

        const second = await ctx.inject({
            method: 'POST',
            url: '/api/v1/integrations',
            body: buildInstallForm(),
        })
        // Pre-existing behavior: a LATER, non-concurrent duplicate is a clean 409 VALIDATION.
        expect(second.statusCode).toBe(StatusCodes.CONFLICT)
        expect(second.json().code).toBe('VALIDATION')

        const rows = await databaseConnection().getRepository('integration_metadata')
            .createQueryBuilder()
            .where('name = :name', { name: PIECE_NAME })
            .andWhere('version = :version', { version: PIECE_VERSION })
            .getMany()
        expect(rows.length).toBe(1)
    })
})
