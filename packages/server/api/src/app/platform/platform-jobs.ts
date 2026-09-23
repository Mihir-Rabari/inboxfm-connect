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

// The in-process job scheduler (`@inboxfm-connect/scheduler`) does not retry a job whose handler
// throws — a thrown error here used to mean "give up on this platform forever the first time a
// child project hasn't finished hard-deleting yet", which is a race every platform delete runs
// (HARD_DELETE_PROJECT jobs are scheduled before HARD_DELETE_PLATFORM, but nothing guarantees they
// finish first — see platformProjectBackgroundJobs#hardDeleteProjectHandler for what runs before a
// project row is actually deleted). Self-rescheduling here, the same way the flow-bundle cleanup
// retry does, makes this wait actually work instead of silently dying on the first unlucky race.
const REMAINING_PROJECTS_RECHECK_DELAY_MS = 2_000
const REMAINING_PROJECTS_MAX_ATTEMPTS = 150

export const platformBackgroundJobs = (log: FastifyBaseLogger) => ({
    hardDeletePlatformHandler: async (data: SystemJobData<SystemJobName.HARD_DELETE_PLATFORM>) => {
        const { platformId, userId, identityId } = data
        const attempt = data.attempt ?? 0
        const remainingProjectsAttempt = data.remainingProjectsAttempt ?? 0

        const remainingProjects = await projectRepo()
            .createQueryBuilder('project')
            .withDeleted()
            .where({ platformId })
            .getCount()

        if (remainingProjects > 0) {
            if (remainingProjectsAttempt >= REMAINING_PROJECTS_MAX_ATTEMPTS) {
                log.error({
                    platform: { id: platformId },
                    remainingProjects,
                    remainingProjectsAttempts: remainingProjectsAttempt,
                }, '[hardDeletePlatformHandler] projects never finished hard-deleting within the retry budget — dead-lettering; operator must investigate why these project hard-deletes are stuck')
                return
            }
            log.info({ platform: { id: platformId }, remainingProjects }, '[hardDeletePlatformHandler] Projects still exist, retrying later')
            await systemJobsSchedule(log).upsertJob({
                job: {
                    name: SystemJobName.HARD_DELETE_PLATFORM,
                    data: { platformId, userId, identityId, attempt, remainingProjectsAttempt: remainingProjectsAttempt + 1 },
                    jobId: `hard-delete-platform-${platformId}`,
                },
                schedule: {
                    type: 'one-time',
                    date: apDayjs().add(REMAINING_PROJECTS_RECHECK_DELAY_MS, 'milliseconds'),
                },
            })
            return
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
