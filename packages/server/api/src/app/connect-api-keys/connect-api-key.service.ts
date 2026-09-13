import { ActivepiecesError, apId, ErrorCode, isNil, secureApId } from '@inboxfm-connect/core-utils'
import { cryptoUtils } from '@inboxfm-connect/server-utils'
import { ConnectApiKey, ConnectApiKeyResponseWithValue } from '@inboxfm-connect/shared'
import { repoFactory } from '../core/db/repo-factory'
import { ConnectApiKeyEntity } from './connect-api-key.entity'

export const CONNECT_API_KEY_PREFIX = 'cak-'
const CONNECT_API_KEY_TOKEN_LENGTH = 64
const connectApiKeyRepo = repoFactory<ConnectApiKey>(ConnectApiKeyEntity)

export const connectApiKeyService = {
    async add({ platformId, projectId, displayName }: AddParams): Promise<ConnectApiKeyResponseWithValue> {
        const generated = generateConnectApiKey()
        const saved = await connectApiKeyRepo().save({
            id: apId(),
            platformId,
            projectId,
            displayName,
            hashedValue: generated.hashed,
            truncatedValue: generated.truncated,
        })
        return {
            ...saved,
            value: generated.raw,
        }
    },

    async getByValue(value: string): Promise<ConnectApiKey | null> {
        const key = await connectApiKeyRepo().findOneBy({
            hashedValue: cryptoUtils.hashSHA256(value),
        })
        if (key) {
            await connectApiKeyRepo().update(key.id, {
                lastUsedAt: new Date().toISOString(),
            })
        }
        return key
    },

    async list({ projectId }: ListParams): Promise<{ data: ConnectApiKey[], next: null, previous: null }> {
        const data = await connectApiKeyRepo().findBy({ projectId })
        return { data, next: null, previous: null }
    },

    async delete({ projectId, id }: DeleteParams): Promise<void> {
        const key = await connectApiKeyRepo().findOneBy({ projectId, id })
        if (isNil(key)) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'connect_api_key',
                    message: `Connect API key with id ${id} not found`,
                },
            })
        }
        await connectApiKeyRepo().delete({ id: key.id })
    },
}

function generateConnectApiKey(): { raw: string, hashed: string, truncated: string } {
    const raw = `${CONNECT_API_KEY_PREFIX}${secureApId(CONNECT_API_KEY_TOKEN_LENGTH - CONNECT_API_KEY_PREFIX.length)}`
    return {
        raw,
        hashed: cryptoUtils.hashSHA256(raw),
        truncated: raw.slice(-4),
    }
}

type AddParams = {
    platformId: string
    projectId: string
    displayName: string
}

type ListParams = {
    projectId: string
}

type DeleteParams = {
    projectId: string
    id: string
}
