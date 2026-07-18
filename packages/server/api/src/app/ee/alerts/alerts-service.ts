import { ActivepiecesError, ApId, apId, ErrorCode, SeekPage } from '@inboxfm-connect/core-utils'
import { apDayjsDuration } from '@inboxfm-connect/server-utils'
import { Alert, AlertChannel, ApEdition, FailedStep, flowStructureUtil, ListAlertsParams, ProjectType } from '@inboxfm-connect/shared'

import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import { FastifyBaseLogger } from 'fastify'
import { userIdentityService } from '../../authentication/user-identity/user-identity-service'
import { repoFactory } from '../../core/db/repo-factory'
import { redisConnections } from '../../database/redis-connections'
import { domainHelper } from '../../helper/domain-helper'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { system } from '../../helper/system/system'
import { projectService } from '../../project/project-service'
import { userService } from '../../user/user-service'
import { emailService } from '../helper/email/email-service'
import { AlertEntity } from './alerts-entity'

dayjs.extend(timezone)

const repo = repoFactory(AlertEntity)
const DAY_IN_SECONDS = apDayjsDuration(1, 'day').asSeconds()
const alertEventKey = (flowVersionId: string) => `flow_fail_count:${flowVersionId}`
const paidEditions = [ApEdition.CLOUD, ApEdition.ENTERPRISE].includes(system.getEdition())

export const alertsService = (log: FastifyBaseLogger) => ({
    async sendAlertOnRunFinish({
        issueToAlert,
        flowRunId,
        failedStep,
    }: {
        issueToAlert: IssueToAlert
        flowRunId: string
        failedStep: FailedStep
    }): Promise<void> {
        // No-op: Flow runs do not exist in headless platform.
    },
    async add({ projectId, channel, receiver }: AddPrams): Promise<void> {
        const normalizedReceiver = receiver.toLowerCase()
        const project = await projectService(log).getOneOrThrow(projectId)
        if (project.type === ProjectType.PERSONAL) {
            const owner = await userService(log).getOneOrFail({ id: project.ownerId })
            const identity = await userIdentityService(log).getOneOrFail({ id: owner.identityId })
            if (identity.email.toLowerCase() !== normalizedReceiver) {
                throw new ActivepiecesError({
                    code: ErrorCode.VALIDATION,
                    params: {
                        message: 'Personal projects only allow the project owner as alert receiver',
                    },
                })
            }
        }
        const alertId = apId()
        const existingAlert = await repo()
            .createQueryBuilder('alert')
            .where('alert."projectId" = :projectId', { projectId })
            .andWhere('LOWER(alert.receiver) = :receiver', { receiver: normalizedReceiver })
            .getOne()

        if (existingAlert) {
            throw new ActivepiecesError({
                code: ErrorCode.EXISTING_ALERT_CHANNEL,
                params: {
                    email: normalizedReceiver,
                },
            })
        }

        await repo().createQueryBuilder()
            .insert()
            .into(AlertEntity)
            .values({
                id: alertId,
                channel,
                projectId,
                receiver: normalizedReceiver,
                created: dayjs().toISOString(),
            })
            .execute()
    },
    async list({ projectId, cursor, limit }: ListAlertsParams): Promise<SeekPage<Alert>> {
        const decodedCursor = paginationHelper.decodeCursor(cursor ?? null)
        const paginator = buildPaginator({
            entity: AlertEntity,
            query: {
                limit,
                order: 'ASC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })

        const query = repo().createQueryBuilder(AlertEntity.options.name).where({
            projectId,
        })

        const { data, cursor: newCursor } = await paginator.paginate(query)
        return paginationHelper.createPage<Alert>(data, newCursor)
    },
    async delete({ alertId }: { alertId: ApId }): Promise<void> {
        await repo().delete({
            id: alertId,
        })
    },
})

async function sendAlertOnFlowFailure(log: FastifyBaseLogger, params: IssueParams): Promise<void> {
    const { flowRunId, projectId } = params

    const runUrl = await domainHelper.getInternalUrl({
        path: `projects/${projectId}/runs/${flowRunId}`,
    })

    await emailService(log).sendIssueCreatedNotification({
        ...params,
        runUrl,
    })
}

type AddPrams = {
    projectId: string
    channel: AlertChannel
    receiver: string
}

type IssueParams = {
    projectId: string
    flowVersionId: string
    projectName: string
    platformId: string
    flowId: string
    flowRunId: string
    flowName: string
    createdAt: string
    failedStepDisplayName: string
    failedStepNumber?: number
    failedStepMessage?: string
}

type IssueToAlert = {
    flowVersionId: string
    projectId: string
    flowId: string
    created: string
}
