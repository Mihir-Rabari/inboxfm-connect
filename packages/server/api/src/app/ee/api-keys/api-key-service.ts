import { ActivepiecesError, apId, assertNotNullOrUndefined, ErrorCode, isNil, secureApId, SeekPage } from '@inboxfm-connect/core-utils'
import { cryptoUtils } from '@inboxfm-connect/server-utils'
import { ApiKey, ApiKeyResponseWithValue } from '@inboxfm-connect/shared'
import { repoFactory } from '../../core/db/repo-factory'
import { ApiKeyEntity } from './api-key-entity'

const API_KEY_TOKEN_LENGTH = 64
const repo = repoFactory<ApiKey>(ApiKeyEntity)

export const apiKeyService = {
    async add({
        platformId,
        projectId,
        displayName,
    }: AddParams): Promise<ApiKeyResponseWithValue> {
        const generatedApiKey = generateApiKey()
        const savedApiKey = await repo().save({
            id: apId(),
            platformId,
            projectId: projectId ?? null,
            displayName,
            hashedValue: generatedApiKey.secretHashed,
            truncatedValue: generatedApiKey.secretTruncated,
        })
        return {
            ...savedApiKey,
            value: generatedApiKey.secret,
        }
    },
    async getByValue(key: string): Promise<ApiKey | null> {
        assertNotNullOrUndefined(key, 'key')
        const apiKey = await repo().findOneBy({
            hashedValue: cryptoUtils.hashSHA256(key),
        })
        if (apiKey) {
            await repo().update(apiKey.id, {
                lastUsedAt: new Date().toISOString(),
            })
        }
        return apiKey
    },
    async list({ platformId, projectId }: ListParams): Promise<SeekPage<ApiKey>> {
        const data = await repo().findBy({
            platformId,
            ...(projectId ? { projectId } : {}),
        })

        return {
            data,
            next: null,
            previous: null,
        }
    },
    async delete({ platformId, projectId, id }: DeleteParams): Promise<void> {
        const apiKey = await repo().findOneBy({
            platformId,
            id,
            ...(projectId ? { projectId } : {}),
        })
        if (isNil(apiKey)) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    message: `api key with id ${id} not found`,
                },
            })
        }
        await repo().delete({
            id: apiKey.id,
        })
    },
}

export function generateApiKey() {
    const secretValue = secureApId(API_KEY_TOKEN_LENGTH - 3)
    const secretKey = `sk-${secretValue}`
    return {
        secret: secretKey,
        secretHashed: cryptoUtils.hashSHA256(secretKey),
        secretTruncated: secretKey.slice(-4),
    }
}

type AddParams = {
    platformId: string
    projectId?: string
    displayName: string
}

type DeleteParams = {
    id: string
    platformId: string
    projectId?: string
}

type ListParams = {
    platformId?: string
    projectId?: string
}
