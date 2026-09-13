import { ActivepiecesError, apId, ErrorCode, isNil, secureApId } from '@inboxfm-connect/core-utils'
import { cryptoUtils } from '@inboxfm-connect/server-utils'
import { ConnectSession, ConnectSessionPublicInfo } from '@inboxfm-connect/shared'
import { repoFactory } from '../core/db/repo-factory'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { ConnectSessionEntity } from './connect-session.entity'

const CONNECT_SESSION_TOKEN_LENGTH = 64
const DEFAULT_EXPIRES_IN_SECONDS = 900
const repo = repoFactory<ConnectSession>(ConnectSessionEntity)

export const connectSessionService = {
    async create({ projectId, externalUserId, allowedPieceNames, expiresInSeconds }: CreateParams): Promise<CreateResult> {
        const token = generateConnectSessionToken()
        const expiresAt = new Date(Date.now() + (expiresInSeconds ?? DEFAULT_EXPIRES_IN_SECONDS) * 1000).toISOString()

        await repo().save({
            id: apId(),
            projectId,
            externalUserId,
            allowedPieceNames: allowedPieceNames ?? null,
            hashedToken: token.hashed,
            truncatedToken: token.truncated,
            expiresAt,
            consumedAt: null,
        })

        return {
            token: token.raw,
            expiresAt,
            connectUrl: buildConnectUrl(token.raw),
        }
    },

    async getPublicInfoOrThrow(token: string): Promise<ConnectSessionPublicInfo> {
        const session = await getActiveSessionOrThrow(token)
        return {
            projectId: session.projectId,
            externalUserId: session.externalUserId,
            allowedPieceNames: session.allowedPieceNames,
            expiresAt: session.expiresAt,
        }
    },

    // Only fetches + validates; does not burn the token. Used before a downstream
    // OAuth/secret exchange that might still fail, so a failed attempt can be retried
    // with the same session instead of forcing the end-user to restart the whole flow.
    async getActiveOrThrow(token: string): Promise<ConnectSession> {
        return getActiveSessionOrThrow(token)
    },

    // Called only after the connection was successfully created, so the token is
    // single-use exactly once a connection actually exists.
    async markConsumed(id: string): Promise<void> {
        await repo().update(id, {
            consumedAt: new Date().toISOString(),
        })
    },
}

async function getActiveSessionOrThrow(token: string): Promise<ConnectSession> {
    const session = await repo().findOneBy({
        hashedToken: cryptoUtils.hashSHA256(token),
    })
    if (isNil(session)) {
        throw new ActivepiecesError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {
                entityType: 'connect_session',
                message: 'Connect session not found or already used',
            },
        })
    }
    if (!isNil(session.consumedAt)) {
        throw new ActivepiecesError({
            code: ErrorCode.SESSION_EXPIRED,
            params: {
                message: 'Connect session has already been used',
            },
        })
    }
    if (new Date(session.expiresAt).getTime() < Date.now()) {
        throw new ActivepiecesError({
            code: ErrorCode.SESSION_EXPIRED,
            params: {
                message: 'Connect session has expired',
            },
        })
    }
    return session
}

function generateConnectSessionToken(): { raw: string, hashed: string, truncated: string } {
    const raw = `cs-${secureApId(CONNECT_SESSION_TOKEN_LENGTH - 3)}`
    return {
        raw,
        hashed: cryptoUtils.hashSHA256(raw),
        truncated: raw.slice(-4),
    }
}

function buildConnectUrl(token: string): string {
    const frontendUrl = system.get(AppSystemProp.FRONTEND_URL) ?? 'http://localhost:3000'
    return `${frontendUrl}/connect/${token}`
}

type CreateParams = {
    projectId: string
    externalUserId: string
    allowedPieceNames?: string[]
    expiresInSeconds?: number
}

type CreateResult = {
    token: string
    connectUrl: string
    expiresAt: string
}
