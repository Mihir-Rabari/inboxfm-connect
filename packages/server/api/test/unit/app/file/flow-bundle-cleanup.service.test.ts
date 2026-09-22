import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFind = vi.fn()
const mockRepoDelete = vi.fn()
const mockDeleteFiles = vi.fn()

vi.mock('../../../../src/app/file/file.entity', () => ({
    FileEntity: {},
}))

vi.mock('../../../../src/app/core/db/repo-factory', () => ({
    repoFactory: vi.fn(() => () => ({
        find: mockFind,
        delete: mockRepoDelete,
        findOneBy: vi.fn(),
        save: vi.fn(),
    })),
}))

/**
 * Required even though flow-bundle-cleanup.service.ts never calls `system` itself: mocking
 * `file.service.ts` (for `fileRepo`) pulls in `s3-helper.ts` / `redis-connections.ts` transitively,
 * which read `system` at module scope. See file-service-delete.test.ts for the same note.
 */
vi.mock('../../../../src/app/helper/system/system', () => ({
    system: {
        getOrThrow: vi.fn().mockReturnValue('DB'),
        getNumberOrThrow: vi.fn().mockReturnValue(30),
        getNumber: vi.fn().mockReturnValue(undefined),
        getBoolean: vi.fn().mockReturnValue(false),
        get: vi.fn().mockReturnValue(undefined),
    },
}))

vi.mock('../../../../src/app/helper/exception-handler', () => ({
    exceptionHandler: { handle: vi.fn() },
}))

vi.mock('../../../../src/app/file/s3-helper', () => ({
    s3Helper: vi.fn(() => ({
        deleteFiles: mockDeleteFiles,
        uploadFile: vi.fn(),
        constructS3Key: vi.fn(),
    })),
}))

import {
    FLOW_BUNDLE_CLEANUP_MAX_ATTEMPTS,
    flowBundleCleanupService,
    nextFlowBundleCleanupAttempt,
} from '../../../../src/app/file/flow-bundle-cleanup.service'

const mockLog = {
    info: vi.fn(), debug: vi.fn(), error: vi.fn(), warn: vi.fn(),
    child: vi.fn(), fatal: vi.fn(), trace: vi.fn(), silent: vi.fn(), level: 'info',
// eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

describe('flowBundleCleanupService#cleanupForProject', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('deletes S3 objects and file rows for a project scoped by projectId', async () => {
        mockFind.mockResolvedValue([
            { id: 'bundle-1', s3Key: 'project/proj-1/FLOW_BUNDLE/bundle-1' },
            { id: 'bundle-2', s3Key: 'project/proj-1/FLOW_BUNDLE/bundle-2' },
        ])
        mockDeleteFiles.mockResolvedValue(undefined)
        mockRepoDelete.mockResolvedValue({ affected: 2 })

        const result = await flowBundleCleanupService(mockLog).cleanupForProject({ projectId: 'proj-1' })

        expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
            where: { type: 'FLOW_BUNDLE', projectId: 'proj-1' },
        }))
        expect(mockDeleteFiles).toHaveBeenCalledWith([
            'project/proj-1/FLOW_BUNDLE/bundle-1',
            'project/proj-1/FLOW_BUNDLE/bundle-2',
        ])
        expect(mockRepoDelete).toHaveBeenCalledTimes(1)
        expect(result).toEqual({ deletedCount: 2, failed: false })
    })

    it('is a no-op when the project has no flow bundles', async () => {
        mockFind.mockResolvedValue([])

        const result = await flowBundleCleanupService(mockLog).cleanupForProject({ projectId: 'proj-empty' })

        expect(mockDeleteFiles).not.toHaveBeenCalled()
        expect(mockRepoDelete).not.toHaveBeenCalled()
        expect(result).toEqual({ deletedCount: 0, failed: false })
    })

    it('skips S3 entirely for DB-stored bundles (no s3Key)', async () => {
        mockFind.mockResolvedValue([{ id: 'bundle-1', s3Key: null }])
        mockRepoDelete.mockResolvedValue({ affected: 1 })

        const result = await flowBundleCleanupService(mockLog).cleanupForProject({ projectId: 'proj-1' })

        expect(mockDeleteFiles).toHaveBeenCalledWith([])
        expect(mockRepoDelete).toHaveBeenCalledTimes(1)
        expect(result).toEqual({ deletedCount: 1, failed: false })
    })

    it('is idempotent — running cleanup again after everything is already deleted finds nothing and does not error', async () => {
        mockFind.mockResolvedValueOnce([{ id: 'bundle-1', s3Key: 'project/proj-1/FLOW_BUNDLE/bundle-1' }])
        mockDeleteFiles.mockResolvedValue(undefined)
        mockRepoDelete.mockResolvedValue({ affected: 1 })
        await flowBundleCleanupService(mockLog).cleanupForProject({ projectId: 'proj-1' })

        mockFind.mockResolvedValueOnce([])
        const secondRun = await flowBundleCleanupService(mockLog).cleanupForProject({ projectId: 'proj-1' })

        expect(secondRun).toEqual({ deletedCount: 0, failed: false })
        expect(mockDeleteFiles).toHaveBeenCalledTimes(1)
    })

    it('leaves file rows intact and reports failure when the S3 delete call throws (retryable)', async () => {
        mockFind.mockResolvedValue([{ id: 'bundle-1', s3Key: 'project/proj-1/FLOW_BUNDLE/bundle-1' }])
        mockDeleteFiles.mockRejectedValue(new Error('S3 unavailable'))

        const result = await flowBundleCleanupService(mockLog).cleanupForProject({ projectId: 'proj-1' })

        expect(mockRepoDelete).not.toHaveBeenCalled()
        expect(result).toEqual({ deletedCount: 0, failed: true })
        expect(mockLog.error).toHaveBeenCalledWith(
            expect.objectContaining({ flowBundle: { pendingCount: 1 }, project: { id: 'proj-1' } }),
            expect.any(String),
        )
    })

    it('succeeds on retry after a prior partial failure once S3 recovers', async () => {
        mockFind.mockResolvedValue([{ id: 'bundle-1', s3Key: 'project/proj-1/FLOW_BUNDLE/bundle-1' }])
        mockDeleteFiles.mockRejectedValueOnce(new Error('S3 timeout'))
        const firstAttempt = await flowBundleCleanupService(mockLog).cleanupForProject({ projectId: 'proj-1' })
        expect(firstAttempt.failed).toBe(true)
        expect(mockRepoDelete).not.toHaveBeenCalled()

        mockDeleteFiles.mockResolvedValueOnce(undefined)
        mockRepoDelete.mockResolvedValue({ affected: 1 })
        const secondAttempt = await flowBundleCleanupService(mockLog).cleanupForProject({ projectId: 'proj-1' })

        expect(secondAttempt).toEqual({ deletedCount: 1, failed: false })
    })
})

describe('flowBundleCleanupService#cleanupForPlatform', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('scopes the query and S3 deletes by platformId', async () => {
        mockFind.mockResolvedValue([{ id: 'bundle-1', s3Key: 'platform/plat-1/FLOW_BUNDLE/bundle-1' }])
        mockDeleteFiles.mockResolvedValue(undefined)
        mockRepoDelete.mockResolvedValue({ affected: 1 })

        const result = await flowBundleCleanupService(mockLog).cleanupForPlatform({ platformId: 'plat-1' })

        expect(mockFind).toHaveBeenCalledWith(expect.objectContaining({
            where: { type: 'FLOW_BUNDLE', platformId: 'plat-1' },
        }))
        expect(result).toEqual({ deletedCount: 1, failed: false })
    })
})

describe('nextFlowBundleCleanupAttempt', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns a retry decision with backoff below the attempt cap', () => {
        const decision = nextFlowBundleCleanupAttempt({ attempt: 0, log: mockLog, context: { project: { id: 'proj-1' } } })

        expect(decision).toEqual({ action: 'retry', delayMs: expect.any(Number), nextAttempt: 1 })
        expect(mockLog.error).not.toHaveBeenCalled()
    })

    it('dead-letters once the attempt cap is reached, logging an observable error', () => {
        const decision = nextFlowBundleCleanupAttempt({
            attempt: FLOW_BUNDLE_CLEANUP_MAX_ATTEMPTS,
            log: mockLog,
            context: { project: { id: 'proj-1' } },
        })

        expect(decision).toEqual({ action: 'dead-letter' })
        expect(mockLog.error).toHaveBeenCalledWith(
            expect.objectContaining({ flowBundle: { cleanupAttempts: FLOW_BUNDLE_CLEANUP_MAX_ATTEMPTS }, project: { id: 'proj-1' } }),
            expect.any(String),
        )
    })
})
