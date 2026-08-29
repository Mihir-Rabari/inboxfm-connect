import { AppConnection, ScheduledTask, TriggerBinding } from '@/lib/api/types'

export function githubTriggerBinding(overrides: Partial<TriggerBinding> = {}): TriggerBinding {
  return {
    id: 'tb_github_issue',
    created: '2026-03-01T09:00:00.000Z',
    updated: '2026-03-02T10:30:00.000Z',
    projectId: 'proj_default',
    platformId: 'plat_default',
    pieceName: 'github',
    pieceVersion: '0.3.4',
    triggerName: 'newIssue',
    connectionId: 'conn_github_1',
    promptTemplate: 'Summarize the issue and post it to Slack.',
    settings: {},
    status: 'ENABLED',
    ...overrides,
  }
}

export function slackScheduledTask(overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id: 'st_daily_digest',
    created: '2026-04-01T08:00:00.000Z',
    updated: '2026-04-01T08:00:00.000Z',
    projectId: 'proj_default',
    platformId: 'plat_default',
    prompt: 'Summarize unread inbox and post the digest.',
    cronExpression: '0 8 * * *',
    timezone: 'Asia/Kolkata',
    status: 'ENABLED',
    lastRunAt: null,
    nextRunAt: null,
    ...overrides,
  }
}

export function automationConnection(
  overrides: Partial<AppConnection> = {}
): AppConnection {
  return {
    id: 'conn_github_1',
    created: '2026-02-15T10:00:00.000Z',
    updated: '2026-02-15T10:00:00.000Z',
    displayName: 'Mihir GitHub',
    pieceName: 'github',
    pieceVersion: '0.3.4',
    type: 'OAUTH2',
    status: 'ACTIVE',
    externalId: 'ext_conn_github_1',
    projectIds: ['proj_default'],
    ...overrides,
  }
}
