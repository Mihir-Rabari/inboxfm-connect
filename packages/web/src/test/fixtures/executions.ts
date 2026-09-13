import { Execution, ExecutionEvent, ExecutionsListResponse, ToolCall } from '@/lib/api/types'
import { StubRoute } from '@/test/api-stub'

export const EXECUTIONS_PROJECT_ID = 'proj_activity_test'

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60000).toISOString()
}

export const recordedExecution: Execution = {
  id: 'exec_recorded_1',
  created: minutesAgo(2),
  updated: minutesAgo(2),
  projectId: EXECUTIONS_PROJECT_ID,
  platformId: 'plat_activity_test',
  userId: 'user_1',
  status: 'CREATED',
  prompt: 'Summarize new GitHub issues and post the digest to Slack.',
  metadata: {},
}

export const triggerExecution: Execution = {
  id: 'exec_trigger_1',
  created: minutesAgo(30),
  updated: minutesAgo(30),
  projectId: EXECUTIONS_PROJECT_ID,
  platformId: 'plat_activity_test',
  status: 'CREATED',
  prompt: 'Enrich the incoming lead and file it in Airtable.',
  metadata: {
    triggerBindingId: 'tb_lead_webhook',
    pieceName: 'webhook',
    triggerName: 'webhook_trigger',
    item: { leadId: 'lead_42' },
  },
}

export const scheduledExecution: Execution = {
  id: 'exec_scheduled_1',
  created: minutesAgo(90),
  updated: minutesAgo(90),
  projectId: EXECUTIONS_PROJECT_ID,
  platformId: 'plat_activity_test',
  status: 'CREATED',
  prompt: 'Compile the daily revenue summary every morning.',
  metadata: {
    scheduledTaskId: 'st_daily_revenue',
    cronExpression: '0 8 * * *',
    timezone: 'UTC',
  },
}

export const manualExecution: Execution = {
  id: 'exec_manual_1',
  created: minutesAgo(240),
  updated: minutesAgo(240),
  projectId: EXECUTIONS_PROJECT_ID,
  platformId: 'plat_activity_test',
  status: 'CREATED',
  prompt: 'One-off prompt submitted through the public API.',
  metadata: { note: 'created by an external script' },
}

export function executionsPage(items: Execution[]): ExecutionsListResponse<Execution> {
  return { data: items, next: null, previous: null }
}

export function executionsListRoute(
  items: Execution[],
  options: { status?: number } = {},
): StubRoute {
  return {
    match: (url, method) => url.pathname === '/api/v1/executions' && (method ?? 'GET') === 'GET',
    respond: () => ({
      status: options.status ?? 200,
      body: options.status && options.status >= 400 ? { message: 'Project ID is required' } : executionsPage(items),
    }),
  }
}

export const succeededToolCall: ToolCall = {
  id: 'tc_succeeded_1',
  created: minutesAgo(4),
  updated: minutesAgo(4),
  executionId: recordedExecution.id,
  projectId: EXECUTIONS_PROJECT_ID,
  pieceName: '@inboxfm-connect/piece-slack',
  pieceVersion: '0.4.1',
  actionName: 'send_channel_message',
  connectionId: 'conn_slack_1',
  input: { channel: '#general', text: 'Daily digest ready' },
  output: { ts: '1717171717.001', ok: true },
  status: 'SUCCEEDED',
  error: null,
  latencyMs: 431,
  finished: minutesAgo(4),
}

export const failedToolCall: ToolCall = {
  id: 'tc_failed_1',
  created: minutesAgo(3),
  updated: minutesAgo(3),
  executionId: recordedExecution.id,
  projectId: EXECUTIONS_PROJECT_ID,
  pieceName: '@inboxfm-connect/piece-github',
  pieceVersion: '0.9.0',
  actionName: 'create_issue',
  connectionId: null,
  input: { repo: 'inboxfm/connect' },
  output: null,
  status: 'FAILED',
  error: { message: 'Repository not found', code: 'HTTP_404' },
  latencyMs: 120,
  finished: minutesAgo(3),
}

export const pendingToolCall: ToolCall = {
  id: 'tc_pending_1',
  created: minutesAgo(2),
  updated: minutesAgo(2),
  executionId: recordedExecution.id,
  projectId: EXECUTIONS_PROJECT_ID,
  pieceName: '@inboxfm-connect/piece-airtable',
  pieceVersion: '0.2.0',
  actionName: 'create_record',
  input: { table: 'Leads' },
  status: 'PENDING',
  latencyMs: null,
  finished: null,
}

export const runningToolCall: ToolCall = {
  id: 'tc_running_1',
  created: minutesAgo(1),
  updated: minutesAgo(1),
  executionId: recordedExecution.id,
  projectId: EXECUTIONS_PROJECT_ID,
  pieceName: '@inboxfm-connect/piece-hubspot',
  pieceVersion: '0.3.0',
  actionName: 'update_contact',
  input: { contactId: 'c_1' },
  status: 'RUNNING',
  latencyMs: null,
  finished: null,
}

export function executionDetailRoute(
  execution: Execution,
  options: { status?: number; message?: string } = {},
): StubRoute {
  return {
    match: (url, method) =>
      url.pathname === `/api/v1/executions/${execution.id}` && (method ?? 'GET') === 'GET',
    respond: () =>
      options.status && options.status >= 400
        ? { status: options.status, body: { message: options.message ?? 'error' } }
        : { status: 200, body: execution },
  }
}

export function toolCallsRoute(
  executionId: string,
  toolCalls: ToolCall[],
  options: { status?: number } = {},
): StubRoute {
  return {
    match: (url, method) =>
      url.pathname === `/api/v1/executions/${executionId}/tool-calls` && (method ?? 'GET') === 'GET',
    respond: () =>
      options.status && options.status >= 400
        ? { status: options.status, body: { message: 'tool calls unavailable' } }
        : { status: 200, body: toolCalls },
  }
}

export function executionStartedEvent(executionId: string, sequence = 1): ExecutionEvent {
  return {
    id: `${executionId}:${sequence}`,
    executionId,
    type: 'ExecutionStarted',
    timestamp: new Date().toISOString(),
    payload: { executionId, prompt: 'Streamed prompt', timestamp: new Date().toISOString() },
  }
}
