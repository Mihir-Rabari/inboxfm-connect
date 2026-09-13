import { ConnectOAuthApp, PrincipalType, UpsertConnectOAuthAppRequest } from '@inboxfm-connect/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { connectOAuthAppService } from './connect-oauth-app.service'

// Platform-admin config for the OAuth client credentials PLATFORM_OAUTH2 connect
// sessions use — original, non-ee implementation (see connect-oauth-app.entity.ts).
export const connectOAuthAppController: FastifyPluginAsyncZod = async (app) => {
    app.post('/', UpsertRequest, async (req, res) => {
        const result = await connectOAuthAppService.upsert({
            platformId: req.principal.platform.id,
            request: req.body,
        })
        return res.status(StatusCodes.OK).send({
            id: result.id,
            created: result.created,
            updated: result.updated,
            platformId: result.platformId,
            pieceName: result.pieceName,
            clientId: result.clientId,
        })
    })
}

const UpsertRequest = {
    config: {
        security: securityAccess.platformAdminOnly([PrincipalType.USER]),
    },
    schema: {
        tags: ['connect-oauth-apps'],
        description: 'Configure the OAuth client credentials used to let end-users connect a piece via a connect session',
        body: UpsertConnectOAuthAppRequest,
        response: {
            [StatusCodes.OK]: ConnectOAuthApp,
        },
    },
}
