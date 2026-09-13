import { ApId, Permission } from '@inboxfm-connect/core-utils'
import {
    ConnectApiKeyResponseWithoutValue,
    ConnectApiKeyResponseWithValue,
    CreateConnectApiKeyRequest,
    PrincipalType,
} from '@inboxfm-connect/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { ConnectApiKeyEntity } from './connect-api-key.entity'
import { connectApiKeyService } from './connect-api-key.service'

export const connectApiKeyController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', CreateRequest, async (req, res) => {
        const newKey = await connectApiKeyService.add({
            platformId: req.principal.platform.id,
            projectId: req.body.projectId,
            displayName: req.body.displayName,
        })
        return res.status(StatusCodes.CREATED).send(newKey)
    })

    app.get('/', ListRequest, async (req) => {
        return connectApiKeyService.list({ projectId: req.query.projectId })
    })

    app.delete('/:id', DeleteRequest, async (req, res) => {
        await connectApiKeyService.delete({
            projectId: req.projectId,
            id: req.params.id,
        })
        return res.status(StatusCodes.OK).send()
    })
}

const CreateRequest = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER],
            Permission.WRITE_API_KEY,
            { type: ProjectResourceType.BODY },
        ),
    },
    schema: {
        tags: ['connect-api-keys'],
        description: 'Create an API key scoped to a single project, used to authenticate the Connect API (connect sessions, execute)',
        body: CreateConnectApiKeyRequest,
        response: {
            [StatusCodes.CREATED]: ConnectApiKeyResponseWithValue,
        },
    },
}

const ListRequest = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER],
            Permission.READ_API_KEY,
            { type: ProjectResourceType.QUERY },
        ),
    },
    schema: {
        tags: ['connect-api-keys'],
        querystring: z.object({
            projectId: ApId,
        }),
        response: {
            [StatusCodes.OK]: z.object({
                data: z.array(ConnectApiKeyResponseWithoutValue),
                next: z.null(),
                previous: z.null(),
            }),
        },
    },
}

const DeleteRequest = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER],
            Permission.WRITE_API_KEY,
            { type: ProjectResourceType.TABLE, tableName: ConnectApiKeyEntity },
        ),
    },
    schema: {
        tags: ['connect-api-keys'],
        params: z.object({
            id: ApId,
        }),
    },
}
