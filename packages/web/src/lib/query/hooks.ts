import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { automationsApi } from '../api/automations'
import { apiClient } from '../api/client'
import { connectionsApi } from '../api/connections'
import { executeApi } from '../api/execute'
import { executionsApi } from '../api/executions'
import {
  ConnectionsListParams,
  CreateConnectionRequest,
  CreateScheduledTaskRequest,
  CreateTriggerBindingRequest,
  DropdownState,
  ExecuteRequest,
  ExecuteResponse,
  Execution,
  ExecutionStatus,
  GenerateMcpTokenResponse,
  IntegrationOptionsRequest,
  IntegrationsListParams,
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  OAuth2AuthorizationUrlRequest,
  PieceMetadata,
  PieceSummary,
  PopulatedMcpServer,
  ScheduledTask,
  TriggerBinding,
  UpdateMcpServerRequest,
  UpdateScheduledTaskRequest,
  UpdateTriggerBindingRequest,
} from '../api/types'

export function useIntegrations(params?: IntegrationsListParams) {
  return useQuery({
    queryKey: ['integrations', params ?? {}],
    queryFn: () => apiClient.get<PieceSummary[]>('/integrations', { params }),
    placeholderData: keepPreviousData,
  })
}

export function useIntegrationCategories() {
  return useQuery({
    queryKey: ['integration-categories'],
    queryFn: () => apiClient.get<string[]>('/integrations/categories'),
    staleTime: Infinity,
  })
}

export function useIntegration(name?: string) {
  return useQuery({
    queryKey: ['integration', name],
    queryFn: () => apiClient.get<PieceMetadata>(`/integrations/${encodeURIComponent(name ?? '')}`),
    enabled: !!name,
  })
}

export function useConnectionsQuery(params?: ConnectionsListParams) {
  const projectId = apiClient.getProjectId()
  return useQuery({
    queryKey: ['connections', params ?? {}, projectId],
    queryFn: () => connectionsApi.list(params),
  })
}

export function useConnection(id?: string) {
  return useQuery({
    queryKey: ['connection', id],
    queryFn: () => connectionsApi.get({ id: id ?? '' }),
    enabled: !!id,
  })
}

export function useCreateConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: CreateConnectionRequest) => connectionsApi.create(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['connections'] })
    },
  })
}

export function useDeleteConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) => connectionsApi.remove({ id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['connections'] })
      void queryClient.invalidateQueries({ queryKey: ['connection'] })
    },
  })
}

export function useCreateOAuthAuthorizationUrl() {
  return useMutation({
    mutationFn: (request: OAuth2AuthorizationUrlRequest) =>
      connectionsApi.oauth2AuthorizationUrl(request),
  })
}

export function useExecuteTool() {
  return useMutation<ExecuteResponse, unknown, ExecuteRequest>({
    mutationFn: (request: ExecuteRequest) => executeApi.run(request),
  })
}

export function useIntegrationOptions() {
  return useMutation({
    mutationFn: (request: IntegrationOptionsRequest) =>
      apiClient.post<DropdownState>('/integrations/options', request),
  })
}

export function useKnowledgeSearch(request: KnowledgeSearchRequest, enabled = true) {
  return useQuery({
    queryKey: ['knowledge-search', request],
    queryFn: () => apiClient.post<KnowledgeSearchResponse>('/knowledge-search/query', request),
    enabled,
    placeholderData: keepPreviousData,
  })
}

export function useTriggerBindingsQuery() {
  return useQuery({
    queryKey: ['trigger-bindings', apiClient.getProjectId()],
    queryFn: () => automationsApi.listTriggerBindings(),
    select: (page) => page.data,
  })
}

export function useTriggerBindingQuery(id?: string) {
  return useQuery({
    queryKey: ['trigger-binding', id],
    queryFn: () => apiClient.get<TriggerBinding>(`/trigger-bindings/${encodeURIComponent(id ?? '')}`),
    enabled: !!id,
  })
}

export function useCreateTriggerBinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: CreateTriggerBindingRequest) =>
      automationsApi.createTriggerBinding(request),
    onSuccess: (binding) => {
      void queryClient.invalidateQueries({ queryKey: ['trigger-bindings'] })
      void queryClient.invalidateQueries({ queryKey: ['trigger-binding', binding.id] })
      void queryClient.invalidateQueries({ queryKey: ['executions'] })
    },
  })
}

export function useUpdateTriggerBinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: UpdateTriggerBindingRequest }) =>
      apiClient.post<TriggerBinding>(`/trigger-bindings/${encodeURIComponent(id)}`, request),
    onSuccess: (binding) => {
      void queryClient.invalidateQueries({ queryKey: ['trigger-bindings'] })
      void queryClient.invalidateQueries({ queryKey: ['trigger-binding', binding.id] })
      void queryClient.invalidateQueries({ queryKey: ['executions'] })
    },
  })
}

export function useEnableTriggerBinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiClient.post<TriggerBinding>(`/trigger-bindings/${encodeURIComponent(id)}/enable`),
    onSuccess: (binding) => {
      void queryClient.invalidateQueries({ queryKey: ['trigger-bindings'] })
      void queryClient.invalidateQueries({ queryKey: ['trigger-binding', binding.id] })
    },
  })
}

export function useDisableTriggerBinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiClient.post<TriggerBinding>(`/trigger-bindings/${encodeURIComponent(id)}/disable`),
    onSuccess: (binding) => {
      void queryClient.invalidateQueries({ queryKey: ['trigger-bindings'] })
      void queryClient.invalidateQueries({ queryKey: ['trigger-binding', binding.id] })
    },
  })
}

export function useDeleteTriggerBinding() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiClient.delete<void>(`/trigger-bindings/${encodeURIComponent(id)}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['trigger-bindings'] })
      void queryClient.removeQueries({ queryKey: ['trigger-binding', variables.id] })
    },
  })
}

export function useRunTriggerBinding() {
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: unknown }) =>
      apiClient.post<Execution[]>(`/trigger-bindings/${encodeURIComponent(id)}/run`, payload),
  })
}

export function useScheduledTasksQuery() {
  return useQuery({
    queryKey: ['scheduled-tasks', apiClient.getProjectId()],
    queryFn: () => automationsApi.listScheduledTasks(),
    select: (page) => page.data,
  })
}

export function useScheduledTaskQuery(id?: string) {
  return useQuery({
    queryKey: ['scheduled-task', id],
    queryFn: () => apiClient.get<ScheduledTask>(`/scheduled-tasks/${encodeURIComponent(id ?? '')}`),
    enabled: !!id,
  })
}

export function useCreateScheduledTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: CreateScheduledTaskRequest) =>
      automationsApi.createScheduledTask(request),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: ['scheduled-tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['scheduled-task', task.id] })
      void queryClient.invalidateQueries({ queryKey: ['executions'] })
    },
  })
}

export function useUpdateScheduledTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: UpdateScheduledTaskRequest }) =>
      apiClient.post<ScheduledTask>(`/scheduled-tasks/${encodeURIComponent(id)}`, request),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: ['scheduled-tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['scheduled-task', task.id] })
      void queryClient.invalidateQueries({ queryKey: ['executions'] })
    },
  })
}

export function useDeleteScheduledTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiClient.delete<void>(`/scheduled-tasks/${encodeURIComponent(id)}`),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['scheduled-tasks'] })
      void queryClient.removeQueries({ queryKey: ['scheduled-task', variables.id] })
    },
  })
}

export function useRunScheduledTaskNow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string }) =>
      apiClient.post<Execution>(`/scheduled-tasks/${encodeURIComponent(id)}/run`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['executions'] })
    },
  })
}

export function useMcpServerQuery(projectId?: string) {
  const effectiveProjectId = projectId ?? apiClient.getProjectId()
  return useQuery({
    queryKey: ['mcp-server', effectiveProjectId],
    queryFn: () => apiClient.get<PopulatedMcpServer>(`/projects/${encodeURIComponent(effectiveProjectId ?? '')}/mcp-server`),
    enabled: !!effectiveProjectId,
  })
}

export function useUpdateMcpTools() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, request }: { projectId: string; request: UpdateMcpServerRequest }) =>
      apiClient.post<PopulatedMcpServer>(`/projects/${encodeURIComponent(projectId)}/mcp-server`, request),
    onMutate: async ({ projectId, request }) => {
      await queryClient.cancelQueries({ queryKey: ['mcp-server'] })
      const previous = queryClient.getQueryData<PopulatedMcpServer>(['mcp-server', projectId])
      if (previous && request.disabledTools !== undefined) {
        queryClient.setQueryData<PopulatedMcpServer>(['mcp-server', projectId], {
          ...previous,
          disabledTools: request.disabledTools,
        })
      }
      return { previous, projectId }
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData<PopulatedMcpServer>(['mcp-server', context.projectId], context.previous)
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcp-server'] })
    },
  })
}

export function useRotateMcpToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId }: { projectId: string }) =>
      apiClient.post<PopulatedMcpServer>(`/projects/${encodeURIComponent(projectId)}/mcp-server/rotate`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mcp-server'] })
    },
  })
}

export function useGenerateMcpToken() {
  return useMutation({
    mutationFn: ({ projectId }: { projectId: string }) =>
      apiClient.post<GenerateMcpTokenResponse>(`/projects/${encodeURIComponent(projectId)}/mcp-server/token`),
  })
}

export function useExecutionsQuery(params?: { status?: ExecutionStatus; limit?: number }) {
  const projectId = apiClient.getProjectId()
  return useQuery({
    queryKey: ['executions', params ?? {}, projectId],
    queryFn: () => executionsApi.list({ status: params?.status, limit: params?.limit }),
    placeholderData: keepPreviousData,
  })
}

export function useExecutionQuery(id?: string) {
  return useQuery({
    queryKey: ['execution', id],
    queryFn: () => executionsApi.get({ id: id ?? '' }),
    enabled: !!id,
  })
}

/**
 * Kept in the query cache only — tool call input/output is untrusted, unredacted
 * payload data and must never be persisted to browser storage.
 */
export function useExecutionToolCallsQuery(id?: string) {
  return useQuery({
    queryKey: ['execution-tool-calls', id],
    queryFn: () => executionsApi.listToolCalls({ id: id ?? '' }),
    enabled: !!id,
    gcTime: 0,
  })
}
