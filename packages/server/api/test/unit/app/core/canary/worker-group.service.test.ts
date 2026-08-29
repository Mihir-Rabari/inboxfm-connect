import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockFind = vi.fn()
const mockFindOne = vi.fn()
const mockUpdate = vi.fn()

vi.mock('../../../../../src/app/ee/platform/platform-plan/platform-plan.service', () => ({
    platformPlanRepo: () => ({
        find: mockFind,
        findOne: mockFindOne,
        update: mockUpdate,
    }),
}))

const mockDistributedStoreGet = vi.fn()
const mockDistributedStorePut = vi.fn()
const mockDistributedStoreDelete = vi.fn()

vi.mock('../../../../../src/app/database/redis-connections', () => ({
    distributedStore: {
        get: (...args: unknown[]) => mockDistributedStoreGet(...args),
        put: (...args: unknown[]) => mockDistributedStorePut(...args),
        delete: (...args: unknown[]) => mockDistributedStoreDelete(...args),
    },
}))

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

type WorkerGroupService = ReturnType<typeof import('../../../../../src/app/ee/platform/platform-plan/worker-group.service').workerGroupService>

let CANARY_WORKER_GROUP_ID: string

async function loadService(): Promise<WorkerGroupService> {
    const mod = await import('../../../../../src/app/ee/platform/platform-plan/worker-group.service')
    CANARY_WORKER_GROUP_ID = mod.CANARY_WORKER_GROUP_ID
    return mod.workerGroupService(mockLog)
}

describe('workerGroupService', () => {
    let service: WorkerGroupService

    beforeEach(async () => {
        vi.clearAllMocks()
        vi.resetModules()
        service = await loadService()
    })

    describe('getWorkerGroupId', () => {
        it('returns groupId from DB when not cached', async () => {
            mockDistributedStoreGet.mockResolvedValue(null)
            mockFindOne.mockResolvedValue({ workerGroupId: 'canary' })

            const result = await service.getWorkerGroupId({ platformId: 'p1' })

            expect(result).toBe('canary')
            expect(mockDistributedStorePut).toHaveBeenCalledWith('platform:p1:worker_group_id:v2', 'canary', expect.any(Number))
        })

        it('returns null and caches sentinel when platform has no worker group', async () => {
            mockDistributedStoreGet.mockResolvedValue(null)
            mockFindOne.mockResolvedValue({ workerGroupId: null })

            const result = await service.getWorkerGroupId({ platformId: 'p2' })

            expect(result).toBeNull()
            expect(mockDistributedStorePut).toHaveBeenCalledWith('platform:p2:worker_group_id:v2', '__none__', expect.any(Number))
        })

        it('returns null without hitting DB when sentinel is cached', async () => {
            mockDistributedStoreGet.mockResolvedValue('__none__')

            const result = await service.getWorkerGroupId({ platformId: 'p3' })

            expect(result).toBeNull()
            expect(mockFindOne).not.toHaveBeenCalled()
        })

        it('returns cached value without hitting DB', async () => {
            mockDistributedStoreGet.mockResolvedValue('my-group')

            const result = await service.getWorkerGroupId({ platformId: 'p1' })

            expect(result).toBe('my-group')
            expect(mockFindOne).not.toHaveBeenCalled()
        })
    })

    /**
     * `isCanaryPlatform` is a thin predicate over `getWorkerGroupId` — it compares the
     * platform's single `workerGroupId` against `CANARY_WORKER_GROUP_ID`. The previous
     * revision of these tests drove `platformPlanRepo().find()` and expected a
     * canary-platform *list*; that shape no longer exists, so they asserted against a
     * mock the service never calls. Caching is likewise the distributedStore's job
     * (see the getWorkerGroupId block), not an in-process memo, so there is nothing
     * left to assert about DB call counts here.
     */
    describe('isCanaryPlatform', () => {
        it('returns true when the platform worker group is the canary group', async () => {
            mockDistributedStoreGet.mockResolvedValue(null)
            mockFindOne.mockResolvedValue({ workerGroupId: CANARY_WORKER_GROUP_ID })

            const result = await service.isCanaryPlatform({ platformId: 'p1' })

            expect(result).toBe(true)
        })

        it('returns false for a platform on a different worker group', async () => {
            mockDistributedStoreGet.mockResolvedValue(null)
            mockFindOne.mockResolvedValue({ workerGroupId: 'some-other-group' })

            const result = await service.isCanaryPlatform({ platformId: 'p2' })

            expect(result).toBe(false)
        })

        it('returns false for a platform with no worker group', async () => {
            mockDistributedStoreGet.mockResolvedValue(null)
            mockFindOne.mockResolvedValue({ workerGroupId: null })

            const result = await service.isCanaryPlatform({ platformId: 'p3' })

            expect(result).toBe(false)
        })

        it('reads the cached group without touching the DB', async () => {
            mockDistributedStoreGet.mockResolvedValue(CANARY_WORKER_GROUP_ID)

            const result = await service.isCanaryPlatform({ platformId: 'p1' })

            expect(result).toBe(true)
            expect(mockFindOne).not.toHaveBeenCalled()
        })
    })

    describe('updateWorkerGroup', () => {
        it('persists the group and invalidates the cache key', async () => {
            mockUpdate.mockResolvedValue(undefined)
            mockDistributedStoreDelete.mockResolvedValue(undefined)

            await service.updateWorkerGroup({ platformId: 'p1', workerGroupId: null })

            expect(mockUpdate).toHaveBeenCalledWith({ platformId: 'p1' }, { workerGroupId: null })
            expect(mockDistributedStoreDelete).toHaveBeenCalledWith('platform:p1:worker_group_id:v2')
        })
    })

    /**
     * `disableAllCanary` was removed; opting a platform out is now a per-platform
     * `updateCanary({ canary: false })`, which writes `workerGroupId: null`.
     */
    describe('updateCanary', () => {
        it('enrolls a platform into the canary group and invalidates the cache key', async () => {
            mockUpdate.mockResolvedValue(undefined)
            mockDistributedStoreDelete.mockResolvedValue(undefined)

            await service.updateCanary({ platformId: 'p1', canary: true })

            expect(mockUpdate).toHaveBeenCalledWith({ platformId: 'p1' }, { workerGroupId: CANARY_WORKER_GROUP_ID })
            expect(mockDistributedStoreDelete).toHaveBeenCalledWith('platform:p1:worker_group_id:v2')
        })

        it('clears the group when disabling canary', async () => {
            mockUpdate.mockResolvedValue(undefined)
            mockDistributedStoreDelete.mockResolvedValue(undefined)

            await service.updateCanary({ platformId: 'p1', canary: false })

            expect(mockUpdate).toHaveBeenCalledWith({ platformId: 'p1' }, { workerGroupId: null })
        })
    })
})
