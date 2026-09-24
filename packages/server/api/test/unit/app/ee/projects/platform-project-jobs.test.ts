import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockExecutionExists = vi.fn()
const mockProjectDelete = vi.fn()
const mockAppConnectionsDelete = vi.fn()
const mockRunExclusive = vi.fn()
const mockCleanupForProject = vi.fn()
const mockNextAttempt = vi.fn()
const mockUpsertJob = vi.fn()

vi.mock('../../../../../src/app/project/project-entity', () => ({
    ProjectEntity: { options: { name: 'project' } },
}))

vi.mock('../../../../../src/app/execution/execution-entity', () => ({
    ExecutionEntity: { options: { name: 'execution' } },
}))

vi.mock('../../../../../src/app/core/db/repo-factory', () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repoFactory: vi.fn((entity: any) => {
        if (entity.options.name === 'execution') {
            return () => ({ exists: mockExecutionExists })
        }
        return () => ({ delete: mockProjectDelete })
    }),
}))

vi.mock('../../../../../src/app/app-connection/app-connection-service/app-connection-service', () => ({
    appConnectionsRepo: () => ({ delete: mockAppConnectionsDelete }),
}))

vi.mock('../../../../../src/app/core/db/transaction', () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    transaction: vi.fn((operation: (entityManager: any) => Promise<unknown>) => operation({})),
}))

vi.mock('../../../../../src/app/database/redis-connections', () => ({
    distributedLock: vi.fn(() => ({ runExclusive: mockRunExclusive })),
}))

vi.mock('../../../../../src/app/file/flow-bundle-cleanup.service', () => ({
    flowBundleCleanupService: vi.fn(() => ({ cleanupForProject: mockCleanupForProject })),
    nextFlowBundleCleanupAttempt: (...args: unknown[]) => mockNextAttempt(...args),
    ACTIVE_EXECUTION_RECHECK_DELAY_MS: 30_000,
}))

vi.mock('../../../../../src/app/helper/system-jobs/system-job', () => ({
    systemJobsSchedule: vi.fn(() => ({ upsertJob: mockUpsertJob })),
}))

import { platformProjectBackgroundJobs } from '../../../../../src/app/ee/projects/platform-project-jobs'

const mockLog = {
    info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn(),
    child: vi.fn(), fatal: vi.fn(), trace: vi.fn(), silent: vi.fn(), level: 'info',
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

const baseData = { projectId: 'proj-1', platformId: 'plat-1' }

describe('platformProjectBackgroundJobs#hardDeleteProjectHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockRunExclusive.mockImplementation(({ fn }: { fn: () => Promise<unknown> }) => fn())
    })

    it('hard-deletes the project once flow bundle cleanup succeeds and there are no active executions', async () => {
        mockExecutionExists.mockResolvedValue(false)
        mockCleanupForProject.mockResolvedValue({ deletedCount: 3, failed: false })

        await platformProjectBackgroundJobs(mockLog).hardDeleteProjectHandler(baseData)

        expect(mockCleanupForProject).toHaveBeenCalledWith({ projectId: 'proj-1' })
        expect(mockProjectDelete).toHaveBeenCalledWith({ id: 'proj-1', platformId: 'plat-1' })
        expect(mockAppConnectionsDelete).toHaveBeenCalled()
        expect(mockUpsertJob).not.toHaveBeenCalled()
    })

    it('defers hard delete and does not touch flow bundles while the project has active executions', async () => {
        mockExecutionExists.mockResolvedValue(true)

        await platformProjectBackgroundJobs(mockLog).hardDeleteProjectHandler(baseData)

        expect(mockCleanupForProject).not.toHaveBeenCalled()
        expect(mockProjectDelete).not.toHaveBeenCalled()
        expect(mockUpsertJob).toHaveBeenCalledTimes(1)
        const [[scheduled]] = mockUpsertJob.mock.calls
        expect(scheduled.job.data).toEqual({ projectId: 'proj-1', platformId: 'plat-1', attempt: 0 })
        expect(scheduled.job.jobId).toBe('hard-delete-project-proj-1')
    })

    it('reschedules with an incremented attempt when flow bundle cleanup fails and retries remain', async () => {
        mockExecutionExists.mockResolvedValue(false)
        mockCleanupForProject.mockResolvedValue({ deletedCount: 0, failed: true })
        mockNextAttempt.mockReturnValue({ action: 'retry', delayMs: 60_000, nextAttempt: 1 })

        await platformProjectBackgroundJobs(mockLog).hardDeleteProjectHandler(baseData)

        expect(mockProjectDelete).not.toHaveBeenCalled()
        expect(mockUpsertJob).toHaveBeenCalledTimes(1)
        const [[scheduled]] = mockUpsertJob.mock.calls
        expect(scheduled.job.data).toEqual({ projectId: 'proj-1', platformId: 'plat-1', attempt: 1 })
    })

    it('carries the attempt counter from the incoming job data into the retry decision', async () => {
        mockExecutionExists.mockResolvedValue(false)
        mockCleanupForProject.mockResolvedValue({ deletedCount: 0, failed: true })
        mockNextAttempt.mockReturnValue({ action: 'retry', delayMs: 60_000, nextAttempt: 4 })

        await platformProjectBackgroundJobs(mockLog).hardDeleteProjectHandler({ ...baseData, attempt: 3 })

        expect(mockNextAttempt).toHaveBeenCalledWith(expect.objectContaining({ attempt: 3 }))
    })

    it('still hard-deletes the project once cleanup is dead-lettered, so an outage never blocks deletion forever', async () => {
        mockExecutionExists.mockResolvedValue(false)
        mockCleanupForProject.mockResolvedValue({ deletedCount: 0, failed: true })
        mockNextAttempt.mockReturnValue({ action: 'dead-letter' })

        await platformProjectBackgroundJobs(mockLog).hardDeleteProjectHandler(baseData)

        expect(mockUpsertJob).not.toHaveBeenCalled()
        expect(mockProjectDelete).toHaveBeenCalledWith({ id: 'proj-1', platformId: 'plat-1' })
    })

    it('runs the cleanup under a per-project distributed lock', async () => {
        mockExecutionExists.mockResolvedValue(false)
        mockCleanupForProject.mockResolvedValue({ deletedCount: 0, failed: false })

        await platformProjectBackgroundJobs(mockLog).hardDeleteProjectHandler(baseData)

        expect(mockRunExclusive).toHaveBeenCalledWith(expect.objectContaining({
            key: 'flow-bundle-cleanup:project:proj-1',
        }))
    })
})
