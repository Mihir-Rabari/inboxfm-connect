import { apiClient } from './client'
import { PlatformApiKey, PlatformApiKeyWithValue, SeekPage } from './types'

const PLATFORM_API_KEYS_PATH = '/api-keys'

// Platform-wide `sk-` keys, distinct from the project-scoped `cak-` keys in
// `api-keys.ts`. Listing and creation are both gated server-side by
// `platform.plan.apiKeysEnabled` (see `ee/api-keys/api-key-module.ts`), so a
// non-entitled or non-admin caller gets a 402/403 from these endpoints.
const platformApiKeysApi = {
  list(): Promise<SeekPage<PlatformApiKey>> {
    return apiClient.get<SeekPage<PlatformApiKey>>(PLATFORM_API_KEYS_PATH)
  },

  create({ displayName }: { displayName: string }): Promise<PlatformApiKeyWithValue> {
    return apiClient.post<PlatformApiKeyWithValue>(PLATFORM_API_KEYS_PATH, {
      displayName,
    })
  },

  remove({ id }: { id: string }): Promise<void> {
    return apiClient.delete<void>(`${PLATFORM_API_KEYS_PATH}/${encodeURIComponent(id)}`)
  },
}

export { platformApiKeysApi }
