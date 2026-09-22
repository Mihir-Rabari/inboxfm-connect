import { ActivepiecesError, ErrorCode, isNil } from '@inboxfm-connect/core-utils'
import { Principal, PrincipalType } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { nanoid } from 'nanoid'
import { apiKeyService } from '../../../../api-keys/api-key.service'
import { accessTokenManager } from '../../../../authentication/lib/access-token-manager'
import { CONNECT_API_KEY_PREFIX, connectApiKeyService } from '../../../../connect-api-keys/connect-api-key.service'

export const authenticateOrThrow = async (log: FastifyBaseLogger, rawToken: string | null): Promise<Principal> => {
    if (!isNil(rawToken) && rawToken.startsWith(`Bearer ${CONNECT_API_KEY_PREFIX}`)) {
        const trimBearerPrefix = rawToken.replace('Bearer ', '')
        return createPrincipalForConnectApiKey(trimBearerPrefix)
    }
    if (!isNil(rawToken) && rawToken.startsWith('Bearer sk-')) {
        const trimBearerPrefix = rawToken.replace('Bearer ', '')
        return createPrincipalForApiKey(trimBearerPrefix)
    }
    if (!isNil(rawToken) && rawToken.startsWith('Bearer ')) {
        const trimBearerPrefix = rawToken.replace('Bearer ', '')
        return accessTokenManager(log).verifyPrincipal(trimBearerPrefix)
    }
    return {
        id: nanoid(),
        type: PrincipalType.UNKNOWN,
    }
}


// Original, non-ee lookup so platform-wide `sk-` keys keep authenticating in every
// edition. Management (create/list/delete) stays enterprise/cloud-gated in ee/api-keys.
async function createPrincipalForApiKey(apiKeyValue: string): Promise<Principal> {
    const apiKey = await apiKeyService.getByValue(apiKeyValue)
    if (isNil(apiKey)) {
        throw new ActivepiecesError({
            code: ErrorCode.AUTHENTICATION,
            params: {
                message: 'invalid api key',
            },
        })
    }
    return {
        id: apiKey.id,
        type: PrincipalType.SERVICE,
        platform: {
            id: apiKey.platformId,
        },
    }
}

// Original, non-ee credential: always bound to exactly one project. See
// connect-api-key.service.ts and the SERVICE-principal scope check in authorize.ts.
async function createPrincipalForConnectApiKey(apiKeyValue: string): Promise<Principal> {
    const apiKey = await connectApiKeyService.getByValue(apiKeyValue)
    if (isNil(apiKey)) {
        throw new ActivepiecesError({
            code: ErrorCode.AUTHENTICATION,
            params: {
                message: 'invalid api key',
            },
        })
    }
    return {
        id: apiKey.id,
        type: PrincipalType.SERVICE,
        platform: {
            id: apiKey.platformId,
        },
        projectId: apiKey.projectId,
    }
}
