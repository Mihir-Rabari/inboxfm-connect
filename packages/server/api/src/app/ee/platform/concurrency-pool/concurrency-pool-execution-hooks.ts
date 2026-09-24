import { isNil, ProjectId } from '@inboxfm-connect/core-utils'
import { FastifyBaseLogger } from 'fastify'
import { ProjectExecutionConcurrencyHooks } from '../../../execution/concurrency/project-execution-concurrency-hooks'
import { concurrencyPoolService } from './concurrency-pool.service'

// Wired via projectExecutionConcurrencyHooks.set(...) in app.ts (CLOUD/ENTERPRISE
// only, matching how every other ee hook override is scoped there). Makes
// `ConcurrencyPoolEntity.maxConcurrentJobs` — settable today through
// `platform-project-service.ts#update` and `managed-authn-service.ts`, cached via
// `distributedStore`, but never read back by anything — finally take effect: a
// project assigned to a pool gets that pool's limit instead of the flat
// AppSystemProp.PROJECT_EXECUTION_CONCURRENCY_LIMIT default.
export const concurrencyPoolExecutionHooks = (log: FastifyBaseLogger): ProjectExecutionConcurrencyHooks => ({
    resolveLimit: async (projectId: ProjectId): Promise<number | null> => {
        const poolId = await concurrencyPoolService(log).getProjectPoolId(projectId)
        if (isNil(poolId)) {
            return null
        }
        return concurrencyPoolService(log).getPoolLimit(poolId)
    },
})
