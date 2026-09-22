import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockProjectCount = vi.fn()
const mockPlatformDelete = vi.fn()
const mockUserDelete = vi.fn()
const mockUserFind = vi.fn()
const mockIdentityDelete = vi.fn()
const mockRunExclusive = vi.fn()
const mockCleanupForPlatform = vi.fn()
const mockNextAttempt = vi.fn()
const mockUpsertJob = vi.fn()

const mockQueryBuilder = {
    createQueryBuilder: vi.fn().mockReturnThis(),
    withDeleted: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    getCount: () => mockProjectCount(),
}

vi.mock('../../../../src/app/project/project-entity', () => ({
    ProjectEntity: { options: { name: 'project' } },
}))

vi.mock('../../../../src/app/platform/platform.entity', () => ({
    PlatformEntity: { options: { name: 'platform' } },
}))

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repoFactory: vi.fn((entity: any) => {
        if (entity.options.name === 'platform') {
            return () => ({ delete: mockPlatformDelete })
        }
        return () => mockQueryBuilder
    }),
}))

vi.mock('../../../../src/app/user/user-service', () => ({
    userRepo: () => ({ delete: mockUserDelete, find: mockUserFind }),
}))

vi.mock('../../../../src/app/authentication/user-identity/user-identity-service', () => ({
    userIdentityRepository: () => ({ delete: mockIdentityDelete }),
}))

vi.mock('../../../../src/app/core/db/transaction', () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction: vi.fn((operation: (entityManager: any) => Promise<unknown>) => operation({})),
}))

vi.mock('../../../../src/app/database/redis-connections', () => ({
    distributedLock: vi.fn(() => ({ runExclusive: mockRunExclusive })),
}))

vi.mock('../../../../src/app/file/flow-bundle-cleanup.service', () => ({
    flowBundleCleanupService: vi.fn(() => ({ cleanupForPlatform: mockCleanupForPlatform })),
    nextFlowBundleCleanupAttempt: (...args: unknown[]) => mockNextAttempt(...args),
}))

vi.mock('../../../../src/app/helper/system-jobs/system-job', () => ({
    systemJobsSchedule: vi.fn(() => ({ upsertJob: mockUpsertJob })),
}))

import { platformBackgroundJobs } from '../../../../src/app/platform/platform-jobs'

const mockLog = {
    info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn(),
    child: vi.fn(), fatal: vi.fn(), trace: vi.fn(), silent: vi.fn(), level: 'info',
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

const baseData = { platformId: 'plat-1', userId: 'user-1', identityId: 'identity-1' }

describe('platformBackgroundJobs#hardDeletePlatformHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockRunExclusive.mockImplementation(({ fn }: { fn: () => Promise<unknown> }) => fn())
        mockUserFind.mockResolvedValue([])
    })

    it('still throws (unchanged) to signal retry while projects remain, without touching flow bundles', async () => {
        mockProjectCount.mockResolvedValue(2)

        await expect(platformBackgroundJobs(mockLog).hardDeletePlatformHandler(baseData)).rejects.toThrow()

        expect(mockCleanupForPlatform).not.toHaveBeenCalled()
        expect(mockPlatformDelete).not.toHaveBeenCalled()
    })

    it('sweeps platform-scoped flow bundles and hard-deletes the platform once no projects remain', async () => {
        mockProjectCount.mockResolvedValue(0)
        mockCleanupForPlatform.mockResolvedValue({ deletedCount: 0, failed: false })

        await platformBackgroundJobs(mockLog).hardDeletePlatformHandler(baseData)

        expect(mockCleanupForPlatform).toHaveBeenCalledWith({ platformId: 'plat-1' })
        expect(mockPlatformDelete).toHaveBeenCalledWith({ id: 'plat-1' })
    })

    it('reschedules with an incremented attempt when the flow bundle sweep fails and retries remain', async () => {
        mockProjectCount.mockResolvedValue(0)
        mockCleanupForPlatform.mockResolvedValue({ deletedCount: 0, failed: true })
        mockNextAttempt.mockReturnValue({ action: 'retry', delayMs: 60_000, nextAttempt: 1 })

        await platformBackgroundJobs(mockLog).hardDeletePlatformHandler(baseData)

        expect(mockPlatformDelete).not.toHaveBeenCalled()
        expect(mockUpsertJob).toHaveBeenCalledTimes(1)
        const [[scheduled]] = mockUpsertJob.mock.calls
        expect(scheduled.job.data).toEqual({ platformId: 'plat-1', userId: 'user-1', identityId: 'identity-1', attempt: 1 })
    })

    it('still hard-deletes the platform once the flow bundle sweep is dead-lettered', async () => {
        mockProjectCount.mockResolvedValue(0)
        mockCleanupForPlatform.mockResolvedValue({ deletedCount: 0, failed: true })
        mockNextAttempt.mockReturnValue({ action: 'dead-letter' })

        await platformBackgroundJobs(mockLog).hardDeletePlatformHandler(baseData)

        expect(mockUpsertJob).not.toHaveBeenCalled()
        expect(mockPlatformDelete).toHaveBeenCalledWith({ id: 'plat-1' })
    })
})
