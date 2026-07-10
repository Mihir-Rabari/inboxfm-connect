import { ActivepiecesError, apId, assertNotNullOrUndefined, ErrorCode, isNil } from '@inboxfm-connect/core-utils'
import { facebookLeads } from '@inboxfm-connect/piece-facebook-leads'
import { intercom } from '@inboxfm-connect/piece-intercom'
import { slack } from '@inboxfm-connect/piece-slack'
import { square } from '@inboxfm-connect/piece-square'
import { Piece, PieceAuthProperty } from '@inboxfm-connect/pieces-framework'
import { FlowStatus, LATEST_JOB_DATA_SCHEMA_VERSION, RunEnvironment, WorkerJobType } from '@inboxfm-connect/shared'
import { FastifyRequest } from 'fastify'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { flowService } from '../../flows/flow/flow.service'
import { domainHelper } from '../../helper/domain-helper'
import { rejectedPromiseHandler } from '../../helper/promise-handler'
import { projectService } from '../../project/project-service'
import { WebhookFlowVersionToRun, webhookService } from '../../webhooks/webhook.service'
const JobType = { CHAT: 'CHAT', ONE_TIME: 'ONE_TIME', REPEATING: 'REPEATING' } as const
const jobQueue = (_log: unknown) => ({
    add: async (_data: unknown) => {},
})
const payloadOffloader = {
    getPayloadSizeInBytes: (_payload: unknown): number => JSON.stringify(_payload).length,
    savePayloadToFile: async (_params: unknown) => undefined,
    getPayload: async (_params: unknown) => undefined,
    offloadPayload: async (_log: unknown, payload: unknown, _projectId: unknown, _platformId: unknown) => ({ type: 'inline' as const, value: payload }),
}
import { triggerSourceService } from '../trigger-source/trigger-source-service'
import { appEventRoutingService } from './app-event-routing.service'

const appWebhooks: Record<string, Piece<PieceAuthProperty | PieceAuthProperty[] | undefined>> = {
    slack,
    square,
    'facebook-leads': facebookLeads,
    intercom,
}
const pieceNames: Record<string, string> = {
    slack: '@inboxfm-connect/piece-slack',
    square: '@inboxfm-connect/piece-square',
    'facebook-leads': '@inboxfm-connect/piece-facebook-leads',
    intercom: '@inboxfm-connect/piece-intercom',
}

export const appEventRoutingModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(appEventRoutingController, { prefix: '/v1/app-events' })
}

export const appEventRoutingController: FastifyPluginAsyncZod = async (
    fastify,
) => {
    fastify.all(
        '/:pieceUrl',
        {
            config: {
                rawBody: true,
                security: securityAccess.public(),
            },
        },
        async (
            request: FastifyRequest<{
                Body: unknown
                Params: {
                    pieceUrl: string
                }
            }>,
            requestReply,
        ) => {
            const pieceUrl = request.params.pieceUrl
            const payload = {
                headers: request.headers as Record<string, string>,
                body: request.body,
                rawBody: request.rawBody,
                method: request.method,
                queryParams: request.query as Record<string, string>,
            }
            const piece = appWebhooks[pieceUrl]
            if (isNil(piece)) {
                throw new ActivepiecesError({
                    code: ErrorCode.ENTITY_NOT_FOUND,
                    params: {
                        entityType: 'piece',
                        entityId: pieceUrl,
                        message: 'Piece is not found in app event routing',
                    },
                })
            }
            const appName = pieceNames[pieceUrl]
            assertNotNullOrUndefined(piece.events, 'Event is possible in this piece')
            const { reply, event, identifierValue } = piece.events.parseAndReply({
                payload,
                server: {
                    publicUrl: await domainHelper.getPublicUrl({ path: '' }),
                },
            })
            if (!isNil(reply)) {
                request.log.info(
                    {
                        reply,
                        piece: pieceUrl,
                    },
                    '[AppEventRoutingController#event] reply',
                )
                return requestReply
                    .status(StatusCodes.OK)
                    .headers(reply?.headers ?? {})
                    .send(reply?.body ?? {})
            }
            request.log.info(
                {
                    event,
                    identifierValue,
                },
                '[AppEventRoutingController#event] event',
            )
            if (isNil(event) || isNil(identifierValue)) {
                return requestReply.status(StatusCodes.BAD_REQUEST).send({})
            }
            const listeners = await appEventRoutingService.listListeners({
                appName,
                event,
                identifierValue,
            })
            const eventsQueue = listeners.map(async (listener) => {
                const requestId = apId()
                const flow = await flowService(request.log).getOne({ id: listener.flowId, projectId: listener.projectId })
                if (isNil(flow)) {
                    return
                }
                const isSimulating = await triggerSourceService(request.log).existsByFlowId({
                    flowId: listener.flowId,
                    simulate: true,
                })
                const flowVersionIdToRun = await webhookService.getFlowVersionIdToRun(
                    isSimulating ? WebhookFlowVersionToRun.LATEST : WebhookFlowVersionToRun.LOCKED_FALL_BACK_TO_LATEST,
                    flow,
                )
                const platformId = await projectService(request.log).getPlatformId(listener.projectId)
                const jobPayload = await payloadOffloader.offloadPayload(request.log, payload, listener.projectId, platformId)
                return jobQueue(request.log).add({
                    id: requestId,
                    type: JobType.ONE_TIME,
                    data: {
                        platformId,
                        projectId: listener.projectId,
                        schemaVersion: LATEST_JOB_DATA_SCHEMA_VERSION,
                        requestId,
                        payload: jobPayload,
                        flowId: listener.flowId,
                        jobType: WorkerJobType.EXECUTE_WEBHOOK,
                        runEnvironment: isSimulating ? RunEnvironment.TESTING : RunEnvironment.PRODUCTION,
                        saveSampleData: isSimulating,
                        flowVersionIdToRun,
                        execute: flow.status === FlowStatus.ENABLED,
                    },
                })
            })
            rejectedPromiseHandler(Promise.all(eventsQueue), request.log)
            return requestReply.status(StatusCodes.OK).send({})
        },
    )
}
