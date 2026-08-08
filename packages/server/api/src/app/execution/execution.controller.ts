import { CreateExecutionRequestBody, Execution, ListExecutionsRequestQuery, Permission, PrincipalType } from '@inboxfm-connect/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { securityHelper } from '../helper/security-helper'
import { executionService } from './execution.service'

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
