import { ActivepiecesError, ErrorCode } from '@inboxfm-connect/core-utils'
import { PiecesFilterType, ProjectType } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Race regression (issue #469): POST /v1/managed-authn/external-token provisions three
// rows per sign-in, each through a find-then-create against a natural key carrying a
// real unique index:
//
//   project  -> idx_project_platform_id_external_id  (platformId, externalId)
//   identity -> idx_user_identity_email              (email)
//   user     -> idx_user_platform_id_external_id     (platformId, externalId)
//
// Two users pressing "sign in with InboxFM" at the same moment (double-click, retry
// after a 5xx, tab restore, parallel fetches from an embedding UI) both read "no
// existing row" before either insert lands. The loser hit the unique index and
// surfaced a raw QueryFailedError as a 500 on a public authentication endpoint - so
// the loser's very first sign-in failed with an internal error. On the identity leg it
// was worse: the loser got EXISTING_USER ("email already registered") for an email that
// did not exist seconds earlier.
//
// The fix serializes each leg behind distributedLock.runExclusive keyed on its natural
// key and, on a lock fail-open or a lost unique-violation race, converges on the
// winner's row instead of throwing. Same shape as the merged #466 helper.
//
// Each test drives the real externalToken() entrypoint and makes exactly one leg lose
// its race, asserting the sign-in still succeeds and returns the winner's row.

const PRINCIPAL = {
    platformId: 'platform-1',
    externalProjectId: 'ext-project-1',
    externalUserId: 'ext-user-1',
    externalFirstName: 'Ada',
    externalLastName: 'Lovelace',
    projectDisplayName: undefined,
    concurrencyPoolKey: undefined,
    concurrencyPoolLimit: undefined,
    projectRole: 'OWNER',
    pieces: { tags: [], filterType: PiecesFilterType.ALL },
}

const mockProjectUpdate = vi.fn()
const mockProjectGetByNaturalKey = vi.fn()
const mockProjectCreate = vi.fn()

vi.mock('../../../../../src/app/project/project-service', () => ({
    projectService: () => ({
        getByPlatformIdAndExternalId: mockProjectGetByNaturalKey,
        create: mockProjectCreate,
        update: mockProjectUpdate,
    }),
}))

const mockUserGetByNaturalKey = vi.fn()
const mockUserCreate = vi.fn()

vi.mock('../../../../../src/app/user/user-service', () => ({
    userService: () => ({
        getByPlatformAndExternalId: mockUserGetByNaturalKey,
        create: mockUserCreate,
    }),
}))

const mockIdentityGetByEmail = vi.fn()
const mockIdentityCreate = vi.fn()
const mockIdentityGetOneOrFail = vi.fn()

vi.mock('../../../../../src/app/authentication/user-identity/user-identity-service', () => ({
    userIdentityService: () => ({
        getIdentityByEmail: mockIdentityGetByEmail,
        create: mockIdentityCreate,
        getOneOrFail: mockIdentityGetOneOrFail,
    }),
}))

vi.mock('../../../../../src/app/platform/platform.service', () => ({
    platformService: () => ({ getOneOrThrow: vi.fn().mockResolvedValue({ ownerId: 'owner-1' }) }),
}))

vi.mock('../../../../../src/app/pieces/tags/pieces/piece-tag.service', () => ({
    pieceTagService: () => ({
        list: vi.fn().mockResolvedValue([]),
        addTags: vi.fn().mockResolvedValue(undefined),
    }),
}))

vi.mock('../../../../../src/app/ee/platform/concurrency-pool/concurrency-pool.service', () => ({
    concurrencyPoolService: () => ({
        upsertPool: vi.fn(),
        assignProject: vi.fn(),
    }),
}))

vi.mock('../../../../../src/app/ee/projects/project-members/project-member.service', () => ({
    projectMemberService: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('../../../../../src/app/ee/projects/project-plan/project-plan.service', () => ({
    projectLimitsService: () => ({ upsert: vi.fn().mockResolvedValue(undefined) }),
}))

vi.mock('../../../../../src/app/authentication/lib/access-token-manager', () => ({
    accessTokenManager: () => ({ generateToken: vi.fn().mockResolvedValue({ accessToken: 'tok' }) }),
}))

vi.mock('../../../../../src/app/ee/managed-authn/lib/external-token-extractor', () => ({
    externalTokenExtractor: () => ({ extract: vi.fn().mockResolvedValue(PRINCIPAL) }),
}))

// Capture every lock key the service takes so the tests can assert serialization keys.
const takenLockKeys: string[] = []
let lockUnavailable = false

vi.mock('../../../../../src/app/database/redis-connections', () => ({
    distributedLock: () => ({
        runExclusive: ({ key, fn }: { key: string, fn: () => Promise<unknown> }) => {
            takenLockKeys.push(key)
            if (lockUnavailable) {
                return Promise.reject(new Error('redis down'))
            }
            return fn()
        },
    }),
}))

const mockLog: FastifyBaseLogger = {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    fatal: vi.fn(), trace: vi.fn(), child: vi.fn(), silent: vi.fn(),
    level: 'info',
} as unknown as FastifyBaseLogger

async function signIn(): Promise<{ id: string, projectId: string }> {
    const mod = await import('../../../../../src/app/ee/managed-authn/managed-authn-service')
    const response = await mod.managedAuthnService(mockLog).externalToken({ externalAccessToken: 'tok' })
    return { id: response.id, projectId: response.projectId }
}

// Shaped as pg surfaces it (code on the top-level error) and as pglite surfaces it
// (code on the wrapped driverError). Both must be recognised as a lost race.
function uniqueViolation(onDriverError: boolean): Error {
    return onDriverError
        ? Object.assign(new Error('duplicate key'), { driverError: { code: '23505' } })
        : Object.assign(new Error('duplicate key'), { code: '23505' })
}

const WINNER_IDENTITY = {
    id: 'identity-winner', email: 'managed_platform-1_ext-user-1', tokenVersion: 1,
    firstName: 'Ada', lastName: 'Lovelace', trackEvents: true, newsLetter: false, verified: true,
}

const WINNER_PROJECT = { id: 'project-winner', platformId: 'platform-1', type: ProjectType.TEAM }
const WINNER_USER = {
    id: 'user-winner', identityId: 'identity-winner', externalId: 'ext-user-1',
    platformId: 'platform-1', platformRole: 'MEMBER', status: 'ACTIVE',
}

describe('managed authn externalToken races (#469)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        takenLockKeys.length = 0
        lockUnavailable = false
        mockIdentityGetOneOrFail.mockResolvedValue(WINNER_IDENTITY)
        mockProjectCreate.mockResolvedValue({ ...WINNER_PROJECT, id: 'project-new' })
        mockUserCreate.mockResolvedValue({ ...WINNER_USER, id: 'user-new' })
    })

    it('signs in cleanly when nothing races', async () => {
        mockProjectGetByNaturalKey.mockResolvedValue(null)
        mockIdentityGetByEmail.mockResolvedValue(WINNER_IDENTITY)
        mockUserGetByNaturalKey.mockResolvedValue(null)

        await expect(signIn()).resolves.toEqual({ id: 'user-new', projectId: 'project-new' })
    })

    it('takes a lock on each of the three natural keys', async () => {
        mockProjectGetByNaturalKey.mockResolvedValue(null)
        mockIdentityGetByEmail.mockResolvedValue(WINNER_IDENTITY)
        mockUserGetByNaturalKey.mockResolvedValue(null)

        await signIn()

        expect(takenLockKeys).toContain('managed-authn:project:platform-1:ext-project-1')
        expect(takenLockKeys.some((k) => k.startsWith('managed-authn:identity:'))).toBe(true)
        expect(takenLockKeys).toContain('managed-authn:user:platform-1:ext-user-1')
    })

    it('converges on the winner project when the insert loses the race', async () => {
        // Read misses, insert throws 23505, read-back finds the winner.
        mockProjectGetByNaturalKey
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(WINNER_PROJECT)
        mockProjectCreate.mockRejectedValue(uniqueViolation(false))
        mockIdentityGetByEmail.mockResolvedValue(WINNER_IDENTITY)
        mockUserGetByNaturalKey.mockResolvedValue(null)

        await expect(signIn()).resolves.toMatchObject({ projectId: 'project-winner' })
    })

    it('recognises a 23505 surfaced on driverError (pglite) as a lost race', async () => {
        mockProjectGetByNaturalKey
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(WINNER_PROJECT)
        mockProjectCreate.mockRejectedValue(uniqueViolation(true))
        mockIdentityGetByEmail.mockResolvedValue(WINNER_IDENTITY)
        mockUserGetByNaturalKey.mockResolvedValue(null)

        await expect(signIn()).resolves.toMatchObject({ projectId: 'project-winner' })
    })

    it('converges on the winner user when the user insert loses the race', async () => {
        mockProjectGetByNaturalKey.mockResolvedValue(WINNER_PROJECT)
        mockIdentityGetByEmail.mockResolvedValue(WINNER_IDENTITY)
        // User leg: read misses, create throws 23505, read-back finds the winner.
        mockUserGetByNaturalKey
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(WINNER_USER)
        mockUserCreate.mockRejectedValue(uniqueViolation(false))

        await expect(signIn()).resolves.toMatchObject({ id: 'user-winner' })
    })

    it('converges on the winner identity when EXISTING_USER means the same thing', async () => {
        mockProjectGetByNaturalKey.mockResolvedValue(WINNER_PROJECT)
        mockUserGetByNaturalKey.mockResolvedValue(null)
        // Identity leg: read misses, create throws EXISTING_USER ("email already
        // registered") for an email that did not exist a moment ago.
        mockIdentityGetByEmail
            .mockResolvedValueOnce(null)
            .mockResolvedValue(WINNER_IDENTITY)
        mockIdentityCreate.mockRejectedValue(
            new ActivepiecesError({ code: ErrorCode.EXISTING_USER, params: {} }),
        )

        await expect(signIn()).resolves.toMatchObject({ id: 'user-new' })
    })

    it('still succeeds when the lock is unavailable and the leg converges via the index', async () => {
        // Redis outage: the lock must fail open rather than block sign-in.
        lockUnavailable = true
        mockProjectGetByNaturalKey
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(WINNER_PROJECT)
        mockProjectCreate.mockRejectedValue(uniqueViolation(false))
        mockIdentityGetByEmail.mockResolvedValue(WINNER_IDENTITY)
        mockUserGetByNaturalKey.mockResolvedValue(null)

        await expect(signIn()).resolves.toMatchObject({ projectId: 'project-winner' })
    })

    it('propagates a real failure instead of masking it as a lost race', async () => {
        // A DB outage is not a unique violation and must not be swallowed: the read-back
        // finds nothing, so there is no winner to converge on and the error must surface.
        mockProjectGetByNaturalKey
            .mockResolvedValueOnce(null)
            .mockResolvedValue(null)
        mockProjectCreate.mockRejectedValue(new Error('connection terminated'))

        await expect(signIn()).rejects.toThrow(/connection terminated/)
    })
})