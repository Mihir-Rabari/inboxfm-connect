import { apiClient } from './client'
import { Execution, ExecutionsListResponse, ListExecutionsParams, ToolCall } from './types'

function resolveProjectId(projectId?: string): string | undefined {
  return projectId ?? apiClient.getProjectId() ?? undefined
}

const executionsApi = {
  /**
   * `GET /v1/executions` is guarded by ProjectResourceType.QUERY, so `projectId`
   * is mandatory — the server never reads the `x-project-id` header.
   */
  list({ projectId, status, limit }: ListExecutionsParams = {}): Promise<ExecutionsListResponse<Execution>> {
    const effectiveProjectId = resolveProjectId(projectId)
    return apiClient.get<ExecutionsListResponse<Execution>>('/executions', {
      params: {
        ...(effectiveProjectId !== undefined ? { projectId: effectiveProjectId } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(limit !== undefined ? { limit } : {}),
      },
    })
  },

  /**
   * The detail routes derive the tenant from the execution row itself
   * (ProjectResourceType.TABLE), so no projectId is sent — ownership must never be
   * client-asserted for a single-resource read.
   */
  get({ id }: { id: string }): Promise<Execution> {
    return apiClient.get<Execution>(`/executions/${encodeURIComponent(id)}`)
  },

  listToolCalls({ id }: { id: string }): Promise<ToolCall[]> {
    return apiClient.get<ToolCall[]>(`/executions/${encodeURIComponent(id)}/tool-calls`)
  },
}

export { executionsApi }
