import { apDayjs } from '@inboxfm-connect/server-utils'
import { FastifyBaseLogger } from 'fastify'
import { userIdentityRepository } from '../authentication/user-identity/user-identity-service'
import { repoFactory } from '../core/db/repo-factory'
import { transaction } from '../core/db/transaction'
import { distributedLock } from '../database/redis-connections'
import { flowBundleCleanupService, nextFlowBundleCleanupAttempt } from '../file/flow-bundle-cleanup.service'
import { SystemJobData, SystemJobName } from '../helper/system-jobs/common'
import { systemJobsSchedule } from '../helper/system-jobs/system-job'
import { ProjectEntity } from '../project/project-entity'
import { userRepo } from '../user/user-service'
import { PlatformEntity } from './platform.entity'

const projectRepo = repoFactory(ProjectEntity)
const platformRepo = repoFactory(PlatformEntity)

export const platformBackgroundJobs = (log: FastifyBaseLogger) => ({
    hardDeletePlatformHandler: async (data: SystemJobData<SystemJobName.HARD_DELETE_PLATFORM>) => {
        const { platformId, userId, identityId } = data
        const attempt = data.attempt ?? 0

        const remainingProjects = await projectRepo()
            .createQueryBuilder('project')
            .withDeleted()
            .where({ platformId })
            .getCount()

        if (remainingProjects > 0) {
            log.info({ platform: { id: platformId }, remainingProjects }, '[hardDeletePlatformHandler] Projects still exist, retrying later')
            throw new Error(`Platform ${platformId} still has ${remainingProjects} projects, will retry`)
        }

        // Defense-in-depth only: every constituent project already cleans up its own FLOW_BUNDLE
        // artifacts on hard delete (see platformProjectBackgroundJobs#hardDeleteProjectHandler), and
        // a flow bundle always carries a projectId, so this should normally find nothing. It exists
        // to sweep any platform-scoped FLOW_BUNDLE row left over from data that predates that
        // per-project cleanup (or was written outside the normal upload path).
        const cleanupResult = await distributedLock(log).runExclusive({
            key: `flow-bundle-cleanup:platform:${platformId}`,
            timeoutInSeconds: 60,
            fn: () => flowBundleCleanupService(log).cleanupForPlatform({ platformId }),
        })
        if (cleanupResult.failed) {
            const decision = nextFlowBundleCleanupAttempt({
                attempt,
                log,
                context: { platform: { id: platformId } },
            })
            if (decision.action === 'retry') {
                await systemJobsSchedule(log).upsertJob({
                    job: {
                        name: SystemJobName.HARD_DELETE_PLATFORM,
                        data: { platformId, userId, identityId, attempt: decision.nextAttempt },
                        jobId: `hard-delete-platform-${platformId}`,
                    },
                    schedule: {
                        type: 'one-time',
                        date: apDayjs().add(decision.delayMs, 'milliseconds'),
                    },
                })
                return
            }
            // Dead-lettered: fall through and hard-delete the platform anyway so an object-storage
            // outage never blocks a deletion the owner already asked for.
        }

        await transaction(async (entityManager) => {
            await platformRepo(entityManager).delete({ id: platformId })
            await userRepo(entityManager).delete({
                id: userId,
                platformId,
            })
            const usersUsingIdentity = await userRepo(entityManager).find({
                where: {
                    identityId,
                },
                withDeleted: true,
            })
            if (usersUsingIdentity.length === 0) {
                await userIdentityRepository(entityManager).delete({
                    id: identityId,
                })
            }
        })

        log.info({ platform: { id: platformId } }, '[hardDeletePlatformHandler] Platform deleted')
    },
})
