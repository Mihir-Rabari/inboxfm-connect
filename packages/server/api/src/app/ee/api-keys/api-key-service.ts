import { ActivepiecesError, apId, ErrorCode, isNil, secureApId, SeekPage } from '@inboxfm-connect/core-utils'
import { cryptoUtils } from '@inboxfm-connect/server-utils'
import { ApiKey, ApiKeyResponseWithValue } from '@inboxfm-connect/shared'
import { ApiKeyEntity } from '../../api-keys/api-key.entity'
import { repoFactory } from '../../core/db/repo-factory'

const API_KEY_TOKEN_LENGTH = 64
const repo = repoFactory<ApiKey>(ApiKeyEntity)

// Lookup-by-value (used by authentication) lives in the non-ee apiKeyService at
// ../../api-keys/api-key.service — it must stay reachable from CE code.
export const apiKeyService = {
    async add({
        platformId,
        displayName,
    }: AddParams): Promise<ApiKeyResponseWithValue> {
        const generatedApiKey = generateApiKey()
        const savedApiKey = await repo().save({
            id: apId(),
            platformId,
            displayName,
            hashedValue: generatedApiKey.secretHashed,
            truncatedValue: generatedApiKey.secretTruncated,
        })
        return {
            ...savedApiKey,
            value: generatedApiKey.secret,
        }
    },
    async list({ platformId }: ListParams): Promise<SeekPage<ApiKey>> {
        const data = await repo().findBy({
            platformId,
        })

        return {
            data,
            next: null,
            previous: null,
        }
    },
    async delete({ platformId, id }: DeleteParams): Promise<void> {
        const apiKey = await repo().findOneBy({
            platformId,
            id,
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
            platformId,
            id,
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
    displayName: string
}

type DeleteParams = {
    id: string
    platformId: string
}

type ListParams = {
    platformId?: string
}
