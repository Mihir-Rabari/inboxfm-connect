import { AIProviderName } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Race regression (issue #471): GET /v1/ai-providers auto-creates the managed
// ACTIVEPIECES provider on first call. That was a plain find-then-create:
//
//   const activepiecesExists = await repo.existsBy({ platformId, provider })
//   if (flag && !activepiecesExists) await repo.save({ id: apId(), ... })
//
// `ai_provider` is unique on (platformId, provider), so two concurrent first GETs on a
// fresh platform both see "no providers yet", both insert, and the loser takes a raw 23505
// out of a GET route - the exact burst the dashboard chat page produces on load.
//
// The fix serializes the check-and-insert behind a distributed lock keyed on
// (platformId, provider) and converges on a 23505.
//
// IMPORTANT: these tests drive concurrent calls for real. A mocked lock that runs fn()
// immediately - the shape that made an earlier suite of mine unable to fail for the
// behavioural reason it existed - would pass even against the unfixed code, so the lock
// mock below queues its callbacks and releases them one at a time.

const mockExistsBy = vi.fn()
const mockSave = vi.fn()
const mockFindBy = vi.fn()

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: () => () => ({
        existsBy: mockExistsBy,
        save: mockSave,
        findBy: mockFindBy,
    }),
}))

vi.mock('../../../../src/app/flags/flag.service', () => ({
    flagService: () => ({ aiCreditsEnabled: () => true }),
}))

vi.mock('../../../../src/app/helper/encryption', () => ({
    // The entity imports EncryptedObject from this module, so the mock must provide it -
    // a partial mock that drops it fails at import, not at the assertion under test.
    EncryptedObject: { iv: 'string', data: 'string' },
    encryptUtils: {
        encryptObject: vi.fn().mockResolvedValue({ iv: 'iv', data: 'sealed' }),
    },
}))

// The providers registry is a large static import; stub it so the module loads in isolation.
vi.mock('../../../../src/app/ai/providers', () => ({ aiProviders: {} }))

/**
 * A real mutual-exclusion mock: runExclusive queues the callback and only invokes it when
 * no earlier call is still running, so two concurrent callers genuinely interleave the way
 * RedLock would serialize them. A pass-through mock would let both callers reach the
 * existsBy/save pair at once, which is precisely the bug.
 */
let inFlight = 0
const waiters: Array<() => void> = []
let lockUnavailable = false
const takenLockKeys: string[] = []

vi.mock('../../../../src/app/database/redis-connections', () => ({
    distributedLock: () => ({
        runExclusive: async ({ key, fn }: { key: string, fn: () => Promise<unknown> }) => {
            takenLockKeys.push(key)
            if (lockUnavailable) {
                throw new Error('redis down')
            }
            // Claim the lock BEFORE waiting, otherwise every concurrent caller sees
            // inFlight === 0 and proceeds together - which is the bug, not the mock.
            const queued = inFlight > 0
            inFlight += 1
            if (queued) {
                await new Promise<void>((resolve) => waiters.push(resolve))
            }
            try {
                return await fn()
            }
            finally {
                inFlight -= 1
                waiters.shift()?.()
            }
        },
    }),
}))

const mockLog: FastifyBaseLogger = {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    fatal: vi.fn(), trace: vi.fn(), child: vi.fn(), silent: vi.fn(),
    level: 'info',
} as unknown as FastifyBaseLogger

async function loadService() {
    const mod = await import('../../../../src/app/ai/ai-provider-service')
    return mod.aiProviderService(mockLog)
}

function uniqueViolation(onDriverError = false): Error {
    return onDriverError
        ? Object.assign(new Error('duplicate key'), { driverError: { code: '23505' } })
        : Object.assign(new Error('duplicate key'), { code: '23505' })
}

const STORED_PROVIDER = { id: 'provider-1', displayName: 'Inboxfm Connect', provider: AIProviderName.ACTIVEPIECES, enabledForChat: true }

describe('listProviders managed-provider auto-create race (#471)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        inFlight = 0
        waiters.length = 0
        lockUnavailable = false
        takenLockKeys.length = 0
        mockFindBy.mockResolvedValue([STORED_PROVIDER])
        mockSave.mockReset()
        mockSave.mockImplementation(async () => STORED_PROVIDER)
    })


    it('creates exactly one provider when five first GETs race', async () => {
        // The repro from the issue: every caller's first check reports "nothing exists yet".
        // The store is stateful, so the winner's row becomes visible to whoever gets the
        // lock next - which is exactly what makes the in-lock re-check the deciding guard.
        let stored = false
        mockExistsBy.mockImplementation(async () => stored)
        mockSave.mockImplementation(async () => {
            stored = true
            return STORED_PROVIDER
        })

        const service = await loadService()
        const results = await Promise.allSettled([
            service.listProviders('platform-1'),
            service.listProviders('platform-1'),
            service.listProviders('platform-1'),
            service.listProviders('platform-1'),
            service.listProviders('platform-1'),
        ])

        // No caller may see the race as a failure - this is a GET route.
        const rejected = results.filter((r) => r.status === 'rejected')
        expect(rejected.map((r) => String((r as PromiseRejectedResult).reason))).toEqual([])

        // Exactly one insert, despite five concurrent first calls.
        expect(mockSave).toHaveBeenCalledTimes(1)
    })

    it('serializes on the (platformId, provider) key', async () => {
        // Provider absent -> the auto-create path runs -> the lock is taken.
        mockExistsBy.mockResolvedValue(false)

        const service = await loadService()
        await service.listProviders('platform-1')

        expect(takenLockKeys).toEqual([
            `ai-provider:auto-create:platform-1:${AIProviderName.ACTIVEPIECES}`,
        ])
    })

    it('skips the lock entirely when the provider already exists', async () => {
        // The outer fast-path check stays, so steady-state listing never touches Redis.
        mockExistsBy.mockImplementation(async ({ provider }: { provider?: string }) =>
            provider === AIProviderName.ACTIVEPIECES)

        const service = await loadService()
        await service.listProviders('platform-1')

        expect(takenLockKeys).toEqual([])
        expect(mockSave).not.toHaveBeenCalled()
    })

    it('does not insert when a caller inside the lock finds it already created', async () => {
        // First caller inserts; a caller that entered before the insert saw nothing must
        // re-check inside the lock and back off rather than insert a duplicate.
        let inserted = false
        mockExistsBy.mockImplementation(async () => inserted)
        mockSave.mockImplementation(async () => {
            inserted = true
            return STORED_PROVIDER
        })

        const service = await loadService()
        await Promise.all([
            service.listProviders('platform-1'),
            service.listProviders('platform-1'),
        ])

        expect(mockSave).toHaveBeenCalledTimes(1)
    })

    it('converges silently when the insert still loses to a unique violation', async () => {
        // Lock fail-open, then the unserialized insert races and loses. The row this call
        // wanted now exists, so this must NOT surface as an error on a GET route.
        lockUnavailable = true
        mockExistsBy.mockResolvedValue(false)
        mockSave.mockRejectedValue(uniqueViolation())

        const service = await loadService()
        await expect(service.listProviders('platform-1')).resolves.toBeDefined()
        expect(mockLog.warn).toHaveBeenCalled()
    })

    it('recognises 23505 surfaced on driverError (pglite) too', async () => {
        lockUnavailable = true
        mockExistsBy.mockResolvedValue(false)
        mockSave.mockRejectedValue(uniqueViolation(true))

        const service = await loadService()
        await expect(service.listProviders('platform-1')).resolves.toBeDefined()
    })

    it('propagates a real failure rather than masking it as a lost race', async () => {
        lockUnavailable = true
        mockExistsBy.mockResolvedValue(false)
        mockSave.mockRejectedValue(new Error('connection terminated'))

        const service = await loadService()
        await expect(service.listProviders('platform-1')).rejects.toThrow('connection terminated')
    })

    it('does not mark the provider as chat-enabled when one already is', async () => {
        // Preserves the BYO choice the original comment calls out: the auto-created
        // provider must not become a second chat provider.
        // One chat provider already exists -> the auto-created one must not become a second.
        mockExistsBy.mockImplementation(async (q: { enabledForChat?: boolean }) =>
            q.enabledForChat === true)

        const service = await loadService()
        await service.listProviders('platform-1')

        expect(mockExistsBy).toHaveBeenCalledWith({ platformId: 'platform-1', enabledForChat: true })
        const [saved] = mockSave.mock.calls[0]
        expect(saved.enabledForChat).toBe(false)
    })
})