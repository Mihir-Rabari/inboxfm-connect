import { apiClient } from './client'
import { ProjectApiKey, ProjectApiKeyWithValue, SeekPage } from './types'

const API_KEYS_PATH = '/api-keys/project'

function resolveProjectId(projectId?: string): string | undefined {
  return projectId ?? apiClient.getProjectId() ?? undefined
}

const apiKeysApi = {
  list({ projectId }: { projectId?: string } = {}): Promise<SeekPage<ProjectApiKey>> {
    const effectiveProjectId = resolveProjectId(projectId)
    return apiClient.get<SeekPage<ProjectApiKey>>(API_KEYS_PATH, {
      params: effectiveProjectId !== undefined ? { projectId: effectiveProjectId } : {},
    })
  },

  create({ displayName, projectId }: { displayName: string, projectId?: string }): Promise<ProjectApiKeyWithValue> {
    const effectiveProjectId = resolveProjectId(projectId)
    return apiClient.post<ProjectApiKeyWithValue>(API_KEYS_PATH, {
      displayName,
      projectId: effectiveProjectId,
    })
  },

  remove({ id }: { id: string }): Promise<void> {
    return apiClient.delete<void>(`${API_KEYS_PATH}/${encodeURIComponent(id)}`)
  },
}

export { apiKeysApi }
