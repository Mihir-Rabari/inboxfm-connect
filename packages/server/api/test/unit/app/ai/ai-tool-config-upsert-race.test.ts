import { AiToolCapability, AiToolProvider } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Race regression (issue #473): ai-tool-config upsert was find-then-save.
//
//   const existing = await repo().findOneBy({ platformId, capability })
//   await repo().save({ id: existing?.id ?? apId(), ... })
//
// Two concurrent first-time requests for the same capability both read
// `existing = null` before either save lands, so both insert a fresh row and the
// loser violates idx_ai_tool_config_platform_capability, surfacing a raw driver
// error as a 500 on a platform-admin settings route (double-clicked Save, or two
// admin tabs on the same capability).
//
// The fix replaces the read-then-save with a single INSERT ... ON CONFLICT DO
// UPDATE keyed on the unique index, so the loser updates the winner's row instead
// of failing. `orUpdate` is given an explicit column list because TypeORM 0.3.x
// repo().upsert() derives the DO UPDATE set from the entity, which includes the
// primary key - the loser would clobber the winner's id (see 9438507cb7).
//
// These tests assert on the SQL the service emits, so they fail against the old
// find-then-save implementation (which called findOneBy/save and no query
// builder at all) and pass only against the upsert.

const mockFindOneBy = vi.fn()
const mockSave = vi.fn()
const mockExecute = vi.fn()

const mockInsert = vi.fn()
const mockValues = vi.fn()
const mockOrUpdate = vi.fn()
const mockInto = vi.fn()
const mockCreateQueryBuilder = vi.fn()
const mockSetParameter = vi.fn()

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => ({
        findOneBy: mockFindOneBy,
        save: mockSave,
        createQueryBuilder: mockCreateQueryBuilder,
    }),
}))

// Keep the real module exports (the entity imports EncryptedObject from it) and
// override only the encrypt call.
vi.mock('../../../../src/app/helper/encryption', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../../src/app/helper/encryption')>()
    return {
        ...actual,
        encryptUtils: {
            ...actual.encryptUtils,
            encryptObject: vi.fn().mockResolvedValue({ ciphertext: 'sealed' }),
        },
    }
})

const mockLog: FastifyBaseLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
    silent: vi.fn(),
    level: 'info',
} as unknown as FastifyBaseLogger

type AiToolConfigService = ReturnType<typeof import('../../../../src/app/ai/ai-tool-config-service').aiToolConfigService>

async function loadService(): Promise<AiToolConfigService> {
    const mod = await import('../../../../src/app/ai/ai-tool-config-service')
    return mod.aiToolConfigService(mockLog)
}

const request = {
    capability: AiToolCapability.TEXT_GENERATION,
    provider: AiToolProvider.OPENAI,
    auth: { apiKey: 'sk-test' },
} as unknown as Parameters<AiToolConfigService['upsert']>[1]

describe('aiToolConfigService.upsert — concurrent first-write race (#473)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Chain: createQueryBuilder().insert().into().values().setParameter().orUpdate().execute()
        mockCreateQueryBuilder.mockReturnValue({ insert: mockInsert })
        mockInsert.mockReturnValue({ into: mockInto })
        mockInto.mockReturnValue({ values: mockValues })
        mockValues.mockReturnValue({ setParameter: mockSetParameter })
        mockSetParameter.mockReturnValue({ orUpdate: mockOrUpdate })
        mockOrUpdate.mockReturnValue({ execute: mockExecute })
        mockExecute.mockResolvedValue({ identifiers: [{ id: 'generated-id' }] })
        mockFindOneBy.mockResolvedValue(null)
        mockSave.mockResolvedValue(undefined)
    })

    it('upserts on the unique index instead of reading then saving', async () => {
        const service = await loadService()
        await service.upsert('platform-1', request)

        // The find-then-save pair is gone entirely: the read is what made the
        // interleaving possible in the first place.
        expect(mockFindOneBy).not.toHaveBeenCalled()
        expect(mockSave).not.toHaveBeenCalled()

        expect(mockOrUpdate).toHaveBeenCalledWith(
            ['provider', 'auth', 'config', 'enabled'],
            ['platformId', 'capability'],
        )
    })

    it('excludes the primary key from the DO UPDATE column set', async () => {
        const service = await loadService()
        await service.upsert('platform-1', request)

        // If `id` were in the update set, the loser would overwrite the winner's
        // row id with its own apId and a read-back by that id would miss.
        const [, conflictPaths] = mockOrUpdate.mock.calls[0]
        expect(conflictPaths).toEqual(['platformId', 'capability'])

        const [updateColumns] = mockOrUpdate.mock.calls[0]
        expect(updateColumns).not.toContain('id')
    })

    it('writes every column the pre-existing row must end up holding', async () => {
        const service = await loadService()
        await service.upsert('platform-1', request)

        const [inserted] = mockValues.mock.calls[0]
        expect(inserted).toMatchObject({
            platformId: 'platform-1',
            capability: AiToolCapability.TEXT_GENERATION,
            provider: AiToolProvider.OPENAI,
            auth: { ciphertext: 'sealed' },
            enabled: true,
        })
        expect(inserted.id).toBeTruthy()
        // `config` is a nullable JSON column, so it is bound as a parameter rather than
        // inlined - that is also what satisfies TypeORM's _QueryDeepPartialEntity type.
        expect(typeof inserted.config).toBe('function')
        expect(inserted.config()).toBe(':config')
        expect(mockSetParameter).toHaveBeenCalledWith('config', 'null')
    })

    it('does not throw when a concurrent writer has already inserted the row', async () => {
        const service = await loadService()

        // Postgres/PGlite surface the loser of an INSERT..DO UPDATE as a successful
        // statement, so the only observable difference from the racing-winner path is
        // that execute() resolved. What must never happen is a rejection escaping.
        mockExecute.mockResolvedValue({ identifiers: [{ id: 'winner-id' }] })

        await expect(service.upsert('platform-1', request)).resolves.toBeUndefined()
    })

    it('does not re-read the row after writing it', async () => {
        const service = await loadService()
        await service.upsert('platform-1', request)

        // A post-write findOneOrFail(id) would miss for the loser, because the loser
        // inserted with its own id and the winner's row kept its own.
        expect(mockFindOneBy).not.toHaveBeenCalled()
    })

    it('runs the upsert exactly once per request', async () => {
        const service = await loadService()
        await service.upsert('platform-1', request)
        expect(mockExecute).toHaveBeenCalledTimes(1)
        expect(mockSave).not.toHaveBeenCalled()
    })
})