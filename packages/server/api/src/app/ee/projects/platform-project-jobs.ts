import { assertNotNullOrUndefined } from '@inboxfm-connect/core-utils'
import { AppConnectionScope } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains } from 'typeorm'
import { appConnectionsRepo } from '../../app-connection/app-connection-service/app-connection-service'
import { repoFactory } from '../../core/db/repo-factory'
import { transaction } from '../../core/db/transaction'
import { FlowEntity } from '../../flows/flow/flow.entity'
import { SystemJobData, SystemJobName } from '../../helper/system-jobs/common'
import { systemJobsSchedule } from '../../helper/system-jobs/system-job'
import { ProjectEntity } from '../../project/project-entity'

const projectRepo = repoFactory(ProjectEntity)
const flowRepo = repoFactory(FlowEntity)

export const platformProjectBackgroundJobs = (log: FastifyBaseLogger) => ({
    hardDeleteProjectHandler: async (data: SystemJobData<SystemJobName.HARD_DELETE_PROJECT>) => {
        const { projectId, platformId, preDeletedFlowIds } = data
        const job = await systemJobsSchedule(log).getJob(`hard-delete-project-${projectId}`)
        assertNotNullOrUndefined(job, 'job is required')

        const allFlows = await flowRepo().find({
            where: { projectId },
        })

        for (const flow of allFlows) {
            if (preDeletedFlowIds.includes(flow.id)) {
                continue
            }
            const flowExists = await flowRepo().existsBy({ id: flow.id })
            if (!flowExists) {
                log.info({ flow: { id: flow.id } }, '[hardDeleteProjectHandler] Flow already deleted, skipping preDelete')
                continue
            }
            await job.updateData({
                ...data,
                preDeletedFlowIds: [...preDeletedFlowIds, flow.id],
            })
        }

        const flowIds = allFlows.map(flow => flow.id)

        for (const flowId of flowIds) {
            await flowRepo().delete({ id: flowId })
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
