import { CreateTriggerBindingRequest, Permission, PrincipalType, UpdateTriggerBindingRequest } from '@inboxfm-connect/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { triggerBindingService } from './trigger-binding.service'

export const triggerBindingController: FastifyPluginAsyncZod = async (fastify) => {
    fastify.post('/', CreateTriggerBindingRouteOptions, async (request, reply) => {
        const projectId = request.projectId
        const platformId = request.principal.platform.id
        const binding = await triggerBindingService.create({
            request: request.body,
            projectId,
            platformId,
        })
        return reply.status(StatusCodes.CREATED).send(binding)
    })

    fastify.get('/', ListTriggerBindingsRouteOptions, async (request) => {
        const projectId = request.projectId
        const platformId = request.principal.platform.id
        return triggerBindingService.list({
            projectId,
            platformId,
        })
    })

    fastify.get('/:id', GetTriggerBindingRouteOptions, async (request) => {
        const projectId = request.projectId
        const platformId = request.principal.platform.id
        return triggerBindingService.getOneOrThrow({
            id: request.params.id,
            projectId,
            platformId,
        })
    })

    fastify.post('/:id', UpdateTriggerBindingRouteOptions, async (request) => {
        const projectId = request.projectId
        const platformId = request.principal.platform.id
        return triggerBindingService.update({
            id: request.params.id,
            projectId,
            platformId,
            request: request.body,
        })
    })

    fastify.delete('/:id', DeleteTriggerBindingRouteOptions, async (request, reply) => {
        const projectId = request.projectId
        const platformId = request.principal.platform.id
        await triggerBindingService.delete({
            id: request.params.id,
            projectId,
            platformId,
        })
        return reply.status(StatusCodes.NO_CONTENT).send()
    })

    fastify.post('/:id/enable', EnableTriggerBindingRouteOptions, async (request) => {
        const projectId = request.projectId
        const platformId = request.principal.platform.id
        return triggerBindingService.enable({
            id: request.params.id,
            projectId,
            platformId,
        })
    })

    fastify.post('/:id/disable', DisableTriggerBindingRouteOptions, async (request) => {
        const projectId = request.projectId
        const platformId = request.principal.platform.id
        return triggerBindingService.disable({
            id: request.params.id,
            projectId,
            platformId,
        })
    })

    fastify.post('/:id/renew', RenewTriggerBindingRouteOptions, async (request) => {
        const projectId = request.projectId
        const platformId = request.principal.platform.id
        return triggerBindingService.renew({
            id: request.params.id,
            projectId,
            platformId,
        })
    })

    fastify.post('/:id/run', RunTriggerBindingRouteOptions, async (request) => {
        return triggerBindingService.executeRun({
            id: request.params.id,
            projectId: request.projectId,
            platformId: request.principal?.platform?.id,
            triggerPayload: request.body,
        })
    })
}

const CreateTriggerBindingRouteOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.WRITE_RUN,
            { type: ProjectResourceType.BODY },
        ),
    },
    schema: {
        body: CreateTriggerBindingRequest,
    },
}

const ListTriggerBindingsRouteOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.READ_RUN,
            { type: ProjectResourceType.QUERY },
        ),
    },
}

const GetTriggerBindingRouteOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.READ_RUN,
            { type: ProjectResourceType.PARAM },
        ),
    },
    schema: {
        params: z.object({
            id: z.string(),
        }),
    },
}

const UpdateTriggerBindingRouteOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.WRITE_RUN,
            { type: ProjectResourceType.PARAM },
        ),
    },
    schema: {
        params: z.object({
            id: z.string(),
        }),
        body: UpdateTriggerBindingRequest,
    },
}

const DeleteTriggerBindingRouteOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.WRITE_RUN,
            { type: ProjectResourceType.PARAM },
        ),
    },
    schema: {
        params: z.object({
            id: z.string(),
        }),
    },
}

const EnableTriggerBindingRouteOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.WRITE_RUN,
            { type: ProjectResourceType.PARAM },
        ),
    },
    schema: {
        params: z.object({
            id: z.string(),
        }),
    },
}

const DisableTriggerBindingRouteOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.WRITE_RUN,
            { type: ProjectResourceType.PARAM },
        ),
    },
    schema: {
        params: z.object({
            id: z.string(),
        }),
    },
}

const RenewTriggerBindingRouteOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.SERVICE],
            Permission.WRITE_RUN,
            { type: ProjectResourceType.PARAM },
        ),
    },
    schema: {
        params: z.object({
            id: z.string(),
        }),
    },
}

const RunTriggerBindingRouteOptions = {
    config: {
        security: securityAccess.public(),
    },
    schema: {
        params: z.object({
            id: z.string(),
        }),
        body: z.unknown().optional(),
    },
}
