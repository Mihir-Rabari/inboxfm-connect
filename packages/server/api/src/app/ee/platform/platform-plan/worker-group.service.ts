import { isNil } from '@inboxfm-connect/core-utils'
import { apDayjsDuration } from '@inboxfm-connect/server-utils'
import { FastifyBaseLogger } from 'fastify'
import { distributedStore } from '../../../database/redis-connections'
import { platformPlanRepo } from './platform-plan.service'

export const CANARY_WORKER_GROUP_ID = 'canary'

const NO_WORKER_GROUP_SENTINEL = '__none__'
const CACHE_TTL_SECONDS = apDayjsDuration(5, 'minute').asSeconds()
const getWorkerGroupCacheKey = (platformId: string): string => `platform:${platformId}:worker_group_id:v2`
const getWorkerGroupsEnabledCacheKey = (platformId: string): string => `platform:${platformId}:worker_groups_enabled`

export const workerGroupService = (log: FastifyBaseLogger) => ({
    async isWorkerGroupsEnabled({ platformId }: { platformId: string }): Promise<boolean> {
        const cached = await distributedStore.get<string>(getWorkerGroupsEnabledCacheKey(platformId))
        if (!isNil(cached)) {
            return cached === 'true'
        }
        const plan = await platformPlanRepo().findOne({
            select: ['workerGroupsEnabled'],
            where: { platformId },
        })
        const enabled = plan?.workerGroupsEnabled ?? false
        await distributedStore.put(getWorkerGroupsEnabledCacheKey(platformId), enabled ? 'true' : 'false', CACHE_TTL_SECONDS)
        return enabled
    },

    async getWorkerGroupId({ platformId }: { platformId: string }): Promise<string | null> {
        const cached = await distributedStore.get<string>(getWorkerGroupCacheKey(platformId))
        if (!isNil(cached)) {
            return cached === NO_WORKER_GROUP_SENTINEL ? null : cached
        }

        const plan = await platformPlanRepo().findOne({
            select: ['workerGroupId'],
            where: { platformId },
        })

        const groupId = plan?.workerGroupId ?? null
        await distributedStore.put(getWorkerGroupCacheKey(platformId), groupId ?? NO_WORKER_GROUP_SENTINEL, CACHE_TTL_SECONDS)
        return groupId
    },

    async getWorkerGroupPlatformId({ workerGroupId }: { workerGroupId: string }): Promise<string | null> {
        const plan = await platformPlanRepo().findOne({
            select: ['platformId'],
            where: { workerGroupId },
        })

        return plan?.platformId ?? null
    },

    async isCanaryPlatform({ platformId }: { platformId: string }): Promise<boolean> {
        const groupId = await this.getWorkerGroupId({ platformId })
        return groupId === CANARY_WORKER_GROUP_ID
    },

    async updateWorkerGroup({ platformId, workerGroupId }: { platformId: string, workerGroupId: string | null }): Promise<void> {
        await platformPlanRepo().update({ platformId }, { workerGroupId })
        await distributedStore.delete(getWorkerGroupCacheKey(platformId))
    },

    async updateCanary({ platformId, canary }: { platformId: string, canary: boolean }): Promise<void> {
        const workerGroupId = canary ? CANARY_WORKER_GROUP_ID : null
        await platformPlanRepo().update({ platformId }, { workerGroupId })
        await distributedStore.delete(getWorkerGroupCacheKey(platformId))
    },

    async moveJobsToTargetQueue({ platformId, workerGroupId }: { platformId: string, workerGroupId: string | null }): Promise<void> {
        // No-op: queues are eliminated in headless platform
    },
})
