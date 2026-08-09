import { CreateExecutionRequestBody, Execution, ExecutionEvent, ListExecutionsRequestQuery, Permission, PrincipalType, ToolCall } from '@inboxfm-connect/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { securityHelper } from '../helper/security-helper'
import { executionEventService } from './execution-event.service'
import { executionService } from './execution.service'
import { toolCallService } from './tool-call/tool-call.service'

export const executionController: FastifyPluginAsyncZod = async (fastify) => {
    fastify.post('/', CreateExecutionOptions, async (request, reply) => {
        const userId = await securityHelper.getUserIdFromRequest(request)
        const projectId = request.projectId || request.body.projectId
        if (!projectId) {
            return reply.status(StatusCodes.BAD_REQUEST).send({ message: 'projectId is required' })
        }

        const execution = await executionService.create({
            projectId,
            platformId: request.principal.platform.id,
            userId,
            prompt: request.body.prompt,
            metadata: request.body.metadata,
        })

        return reply.status(StatusCodes.CREATED).send(execution)
    })

    fastify.get('/:id', GetExecutionOptions, async (request) => {
        return executionService.getOne({
            id: request.params.id,
            projectId: request.projectId,
        })
    })

    fastify.get('/:id/tool-calls', ListToolCallsOptions, async (request) => {
        return toolCallService.listForExecution({
            executionId: request.params.id,
            projectId: request.projectId,
        })
    })

    fastify.get('/:id/events', GetExecutionEventsOptions, async (request, reply) => {
        const executionId = request.params.id
        await executionService.getOne({
            id: executionId,
            projectId: request.projectId,
        })

        const rawHeader = request.headers['last-event-id']
        const lastEventId = Array.isArray(rawHeader) ? rawHeader[0] : (rawHeader || (request.query as Record<string, string>)['last-event-id'])

        reply.raw.writeHead(StatusCodes.OK, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        })

        const missedEvents = await executionEventService.getEventsSince({
            executionId,
            lastEventId,
        })

        for (const event of missedEvents) {
            reply.raw.write(`id: ${event.id}\n`)
            reply.raw.write(`event: ${event.type}\n`)
            reply.raw.write(`data: ${JSON.stringify(event.payload)}\n\n`)
        }

        const listener = (event: ExecutionEvent) => {
            reply.raw.write(`id: ${event.id}\n`)
            reply.raw.write(`event: ${event.type}\n`)
            reply.raw.write(`data: ${JSON.stringify(event.payload)}\n\n`)
        }

        await executionEventService.subscribe({ executionId, listener })

        const heartbeatTimer = setInterval(() => {
            reply.raw.write(': heartbeat\n\n')
        }, 15000)

        request.raw.on('close', () => {
            clearInterval(heartbeatTimer)
            executionEventService.unsubscribe({ executionId }).catch(() => {})
        })

        return reply
    })

    fastify.get('/', ListExecutionsOptions, async (request) => {
        return executionService.list({
            projectId: request.projectId,
            status: request.query.status,
            limit: request.query.limit,
        })
    })
}

const GetExecutionParams = z.object({
    id: z.string(),
})

const CreateExecutionOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.ENGINE, PrincipalType.SERVICE],
            Permission.WRITE_RUN,
            { type: ProjectResourceType.BODY },
        ),
    },
    schema: {
        tags: ['executions'],
        body: CreateExecutionRequestBody,
        response: {
            [StatusCodes.CREATED]: Execution,
        },
    },
}

const GetExecutionOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.ENGINE, PrincipalType.SERVICE],
            Permission.READ_RUN,
            { type: ProjectResourceType.PARAM, paramName: 'id' },
        ),
    },
    schema: {
        tags: ['executions'],
        params: GetExecutionParams,
        response: {
            [StatusCodes.OK]: Execution,
        },
    },
}

const ListToolCallsOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.ENGINE, PrincipalType.SERVICE],
            Permission.READ_RUN,
            { type: ProjectResourceType.PARAM, paramName: 'id' },
        ),
    },
    schema: {
        tags: ['executions'],
        params: GetExecutionParams,
        response: {
            [StatusCodes.OK]: z.array(ToolCall),
        },
    },
}

const GetExecutionEventsOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.ENGINE, PrincipalType.SERVICE],
            Permission.READ_RUN,
            { type: ProjectResourceType.PARAM, paramName: 'id' },
        ),
    },
    schema: {
        tags: ['executions'],
        params: GetExecutionParams,
    },
}

const ListExecutionsOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.ENGINE, PrincipalType.SERVICE],
            Permission.READ_RUN,
            { type: ProjectResourceType.QUERY },
        ),
    },
    schema: {
        tags: ['executions'],
        querystring: ListExecutionsRequestQuery,
        response: {
            [StatusCodes.OK]: z.object({
                data: z.array(Execution),
                next: z.string().nullable(),
                previous: z.string().nullable(),
            }),
        },
    },
}

