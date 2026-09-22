import { AppConnectionScope } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains } from 'typeorm'
import { appConnectionsRepo } from '../../app-connection/app-connection-service/app-connection-service'
import { repoFactory } from '../../core/db/repo-factory'
import { transaction } from '../../core/db/transaction'
import { SystemJobData, SystemJobName } from '../../helper/system-jobs/common'
import { ProjectEntity } from '../../project/project-entity'

const projectRepo = repoFactory(ProjectEntity)

export const platformProjectBackgroundJobs = (_log: FastifyBaseLogger) => ({
    hardDeleteProjectHandler: async (data: SystemJobData<SystemJobName.HARD_DELETE_PROJECT>) => {
        const { projectId, platformId } = data

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
