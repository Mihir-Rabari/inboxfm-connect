import { assertNotNullOrUndefined } from '@inboxfm-connect/core-utils'
import { cryptoUtils } from '@inboxfm-connect/server-utils'
import { ApiKey } from '@inboxfm-connect/shared'
import { repoFactory } from '../core/db/repo-factory'
import { ApiKeyEntity } from './api-key.entity'

const repo = repoFactory<ApiKey>(ApiKeyEntity)

// Original, non-ee lookup for platform API keys (`sk-` prefix). Available in every
// edition so an existing `api_key` row keeps authenticating regardless of edition —
// management (create/list/delete) stays enterprise/cloud-gated in ee/api-keys.
export const apiKeyService = {
    async getByValue(value: string): Promise<ApiKey | null> {
        assertNotNullOrUndefined(value, 'value')
        const apiKey = await repo().findOneBy({
            hashedValue: cryptoUtils.hashSHA256(value),
        })
        if (apiKey) {
            await repo().update(apiKey.id, {
                lastUsedAt: new Date().toISOString(),
            })
        }
        return apiKey
    },
}
