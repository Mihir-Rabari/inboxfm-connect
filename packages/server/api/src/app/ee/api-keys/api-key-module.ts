import { ApId, assertNotNullOrUndefined, Permission, SeekPage } from '@inboxfm-connect/core-utils'
import { ApiKeyResponseWithoutValue, ApiKeyResponseWithValue, CreateApiKeyRequest, CreateProjectApiKeyRequest, PrincipalType } from '@inboxfm-connect/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../../core/security/authorization/common'
import { securityAccess } from '../../core/security/authorization/fastify-security'
import { platformMustHaveFeatureEnabled } from '../authentication/ee-authorization'
import { ApiKeyEntity } from './api-key-entity'
import { apiKeyService } from './api-key-service'

export const apiKeyModule: FastifyPluginAsyncZod = async (app) => {
    app.addHook('preHandler', platformMustHaveFeatureEnabled((platform) => platform.plan.apiKeysEnabled))
    await app.register(apiKeyController, { prefix: '/v1/api-keys' })
}

export const apiKeyController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', CreateRequest, async (req, res) => {
        const platformId = req.principal.platform.id
        assertNotNullOrUndefined(platformId, 'platformId')

        const newApiKey = await apiKeyService.add({
            platformId,
            displayName: req.body.displayName,
        })

        return res.status(StatusCodes.CREATED).send(newApiKey)
    })

    app.get('/', ListRequest, async (req) => {
        const platformId = req.principal.platform.id
        assertNotNullOrUndefined(platformId, 'platformId')
        return apiKeyService.list({
            platformId,
        })
    })

    app.delete('/:id', DeleteRequest, async (req, res) => {
        const platformId = req.principal.platform.id
        assertNotNullOrUndefined(platformId, 'platformId')
        await apiKeyService.delete({
            id: req.params.id,
            platformId,
        })
        return res.status(StatusCodes.OK).send()
    })

    /**
     * Project-scoped keys let a project admin (a "developer" using the platform as
     * an integrations-as-a-service provider) mint their own API key without needing
     * platform-admin rights. The key is bound to one project — see the SERVICE
     * branch in rbac-service.ts for the enforcement side.
     */
    app.post('/project', CreateProjectRequest, async (req, res) => {
        const newApiKey = await apiKeyService.add({
            platformId: req.principal.platform.id,
            projectId: req.body.projectId,
            displayName: req.body.displayName,
        })
        return res.status(StatusCodes.CREATED).send(newApiKey)
    })

    app.get('/project', ListProjectRequest, async (req) => {
        return apiKeyService.list({
            platformId: req.principal.platform.id,
            projectId: req.query.projectId,
        })
    })

    app.delete('/project/:id', DeleteProjectRequest, async (req, res) => {
        await apiKeyService.delete({
            id: req.params.id,
            platformId: req.principal.platform.id,
        })
        return res.status(StatusCodes.OK).send()
    })
}

const ListRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        response: {
            [StatusCodes.OK]: SeekPage(ApiKeyResponseWithoutValue),
        },
    },
}

const CreateRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        body: CreateApiKeyRequest,
        response: {
            [StatusCodes.CREATED]: ApiKeyResponseWithValue,
        },
    },
}

const DeleteRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        params: z.object({
            id: ApId,
        }),
    },
}

const CreateProjectRequest = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER],
            Permission.WRITE_API_KEY,
            { type: ProjectResourceType.BODY },
        ),
    },
    schema: {
        tags: ['api-keys'],
        description: 'Create an API key scoped to a single project',
        body: CreateProjectApiKeyRequest,
        response: {
            [StatusCodes.CREATED]: ApiKeyResponseWithValue,
        },
    },
}

const ListProjectRequest = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER],
            Permission.READ_API_KEY,
            { type: ProjectResourceType.QUERY },
        ),
    },
    schema: {
        tags: ['api-keys'],
        querystring: z.object({
            projectId: ApId,
        }),
        response: {
            [StatusCodes.OK]: SeekPage(ApiKeyResponseWithoutValue),
        },
    },
}

const DeleteProjectRequest = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER],
            Permission.WRITE_API_KEY,
            { type: ProjectResourceType.TABLE, tableName: ApiKeyEntity },
        ),
    },
    schema: {
        tags: ['api-keys'],
        params: z.object({
            id: ApId,
        }),
    },
}
