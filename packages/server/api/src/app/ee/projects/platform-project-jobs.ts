import { apDayjs } from '@inboxfm-connect/server-utils'
import { AppConnectionScope, ExecutionStatus } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains, In } from 'typeorm'
import { appConnectionsRepo } from '../../app-connection/app-connection-service/app-connection-service'
import { repoFactory } from '../../core/db/repo-factory'
import { transaction } from '../../core/db/transaction'
import { distributedLock } from '../../database/redis-connections'
import { ExecutionEntity, ExecutionSchema } from '../../execution/execution-entity'
import { ACTIVE_EXECUTION_RECHECK_DELAY_MS, flowBundleCleanupService, nextFlowBundleCleanupAttempt } from '../../file/flow-bundle-cleanup.service'
import { SystemJobData, SystemJobName } from '../../helper/system-jobs/common'
import { systemJobsSchedule } from '../../helper/system-jobs/system-job'
import { ProjectEntity } from '../../project/project-entity'

const projectRepo = repoFactory(ProjectEntity)
const executionRepo = repoFactory<ExecutionSchema>(ExecutionEntity)

export const platformProjectBackgroundJobs = (log: FastifyBaseLogger) => ({
    hardDeleteProjectHandler: async (data: SystemJobData<SystemJobName.HARD_DELETE_PROJECT>) => {
        const { projectId, platformId } = data
        const attempt = data.attempt ?? 0

        // A project's flow bundles must never be torn out from under a run that is still reading
        // them. There is no live flow-bundle consumer in this codebase today (see
        // .agents/features/file-storage.md), but `execution` is the one in-flight-work concept that
        // does exist, so gate hard-delete on it — cheap, real, and forward-compatible if a
        // bundle-consuming execution path is reintroduced. This retries indefinitely (no attempt
        // cap): unlike an object-storage outage, active work is expected to finish on its own.
        const hasActiveExecutions = await executionRepo().exists({
            where: { projectId, status: In([ExecutionStatus.CREATED, ExecutionStatus.RUNNING]) },
        })
        if (hasActiveExecutions) {
            log.info({ project: { id: projectId } }, '[hardDeleteProjectHandler] project still has active executions, deferring hard delete')
            await rescheduleHardDeleteProject({ projectId, platformId, attempt, delayMs: ACTIVE_EXECUTION_RECHECK_DELAY_MS, log })
            return
        }

        // Flow bundles are S3-and-DB artifacts; the project row's FK to `file` cascades DB rows away
        // on delete, so their s3Key must be read and the object deleted BEFORE the project row goes —
        // once it cascades there is nothing left to retry against. distributedLock keeps this
        // idempotent and safe if another server concurrently retries the same project.
        const cleanupResult = await distributedLock(log).runExclusive({
            key: `flow-bundle-cleanup:project:${projectId}`,
            timeoutInSeconds: 60,
            fn: () => flowBundleCleanupService(log).cleanupForProject({ projectId }),
        })

        if (cleanupResult.failed) {
            const decision = nextFlowBundleCleanupAttempt({
                attempt,
                log,
                context: { project: { id: projectId } },
            })
            if (decision.action === 'retry') {
                await rescheduleHardDeleteProject({ projectId, platformId, attempt: decision.nextAttempt, delayMs: decision.delayMs, log })
                return
            }
            // Dead-lettered: fall through and hard-delete the project anyway so an object-storage
            // outage never blocks a deletion the owner already asked for.
        }

        await transaction(async (entityManager) => {
            await appConnectionsRepo(entityManager).delete({
                scope: AppConnectionScope.PROJECT,
                projectIds: ArrayContains([projectId]),
            })
            await projectRepo(entityManager).delete({
                id: projectId,
                platformId,
            })
        })
    },
})

async function rescheduleHardDeleteProject({ projectId, platformId, attempt, delayMs, log }: RescheduleHardDeleteProjectParams): Promise<void> {
    await systemJobsSchedule(log).upsertJob({
        job: {
            name: SystemJobName.HARD_DELETE_PROJECT,
            data: { projectId, platformId, attempt },
            jobId: `hard-delete-project-${projectId}`,
        },
        schedule: {
            type: 'one-time',
            date: apDayjs().add(delayMs, 'milliseconds'),
        },
    })
}

type RescheduleHardDeleteProjectParams = {
    projectId: string
    platformId: string
    attempt: number
    delayMs: number
    log: FastifyBaseLogger
}
