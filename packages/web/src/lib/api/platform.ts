import { apiClient } from './client'
import { PlatformWithPlan } from './types'

const platformApi = {
  get({ platformId }: { platformId: string }): Promise<PlatformWithPlan> {
    return apiClient.get<PlatformWithPlan>(`/platforms/${encodeURIComponent(platformId)}`)
  },
}

export { platformApi }
