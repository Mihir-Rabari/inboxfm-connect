import { apiClient } from './client'
import { ExecuteRequest, ExecuteResponse } from './types'

function resolveProjectId(projectId?: string): string | undefined {
  return projectId ?? apiClient.getProjectId() ?? undefined
}

const executeApi = {
  /**
   * Runs a single tool through HeadlessRuntime.
   *
   * The resolved body always carries `projectId` because the route is guarded by
   * ProjectResourceType.BODY — the `x-project-id` header the client also sends is
   * never read by the server. The resolved value is the RAW action output.
   */
  run(request: ExecuteRequest): Promise<ExecuteResponse> {
    const projectId = resolveProjectId(request.projectId)
    return apiClient.post<ExecuteResponse>('/execute', {
      ...request,
      ...(projectId !== undefined ? { projectId } : {}),
    })
  },
}

export { executeApi }
