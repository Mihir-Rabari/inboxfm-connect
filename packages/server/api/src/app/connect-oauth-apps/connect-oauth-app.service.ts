import { ActivepiecesError, apId, ErrorCode, isNil } from '@inboxfm-connect/core-utils'
import { UpsertConnectOAuthAppRequest } from '@inboxfm-connect/shared'
import { repoFactory } from '../core/db/repo-factory'
import { encryptUtils } from '../helper/encryption'
import { ConnectOAuthAppEntity, ConnectOAuthAppWithEncryptedSecret, ConnectOAuthAppWithSecret } from './connect-oauth-app.entity'

const connectOAuthAppRepo = repoFactory<ConnectOAuthAppWithEncryptedSecret>(ConnectOAuthAppEntity)

export const connectOAuthAppService = {
    async upsert({ platformId, request }: { platformId: string, request: UpsertConnectOAuthAppRequest }): Promise<ConnectOAuthAppWithEncryptedSecret> {
        await connectOAuthAppRepo().upsert(
            {
                id: apId(),
                platformId,
                pieceName: request.pieceName,
                clientId: request.clientId,
                clientSecret: await encryptUtils.encryptString(request.clientSecret),
            },
            ['platformId', 'pieceName'],
        )
        return connectOAuthAppRepo().findOneByOrFail({ platformId, pieceName: request.pieceName })
    },

    async getWithSecretOrThrow({ platformId, pieceName }: { platformId: string, pieceName: string }): Promise<ConnectOAuthAppWithSecret> {
        const app = await connectOAuthAppRepo().findOneBy({ platformId, pieceName })
        if (isNil(app)) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'connect_oauth_app',
                    message: `No OAuth app configured for piece "${pieceName}" on this platform`,
                },
            })
        }
        return {
            ...app,
            clientSecret: await encryptUtils.decryptString(app.clientSecret),
        }
    },
}
