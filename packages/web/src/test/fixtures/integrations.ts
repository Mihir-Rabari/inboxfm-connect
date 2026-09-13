import { AppConnection, PieceMetadata, PieceSummary } from '@/lib/api/types'

export const CATEGORIES = ['COMMUNICATION', 'DEVELOPER_TOOLS', 'PRODUCTIVITY']

export function githubSummary(overrides: Partial<PieceSummary> = {}): PieceSummary {
  return {
    name: 'github',
    displayName: 'GitHub',
    logoUrl: 'https://cdn.example/github.svg',
    description: 'Developer collaboration and repository tools.',
    version: '0.3.4',
    actions: 31,
    triggers: 12,
    categories: ['DEVELOPER_TOOLS'],
    auth: { type: 'OAUTH2', required: true },
    ...overrides,
  }
}

export function slackSummary(overrides: Partial<PieceSummary> = {}): PieceSummary {
  return {
    name: 'slack',
    displayName: 'Slack',
    logoUrl: 'https://cdn.example/slack.svg',
    description: 'Team communication and messaging.',
    version: '0.2.1',
    actions: 18,
    triggers: 6,
    categories: ['COMMUNICATION'],
    auth: { type: 'SECRET_TEXT', required: true },
    ...overrides,
  }
}

export function gmailSummary(overrides: Partial<PieceSummary> = {}): PieceSummary {
  return {
    name: 'gmail',
    displayName: 'Gmail',
    logoUrl: 'https://cdn.example/gmail.svg',
    description: 'Send and manage email.',
    version: '1.0.0',
    actions: 9,
    triggers: 3,
    categories: ['COMMUNICATION', 'PRODUCTIVITY'],
    auth: { type: 'OAUTH2', required: true },
    ...overrides,
  }
}

export const ALL_SUMMARIES: PieceSummary[] = [githubSummary(), slackSummary(), gmailSummary()]

function property(displayName: string) {
  return { displayName, required: false, type: 'SHORT_TEXT' }
}

export function githubMetadata(): PieceMetadata {
  return {
    name: 'github',
    displayName: 'GitHub',
    logoUrl: 'https://cdn.example/github.svg',
    description: 'Developer collaboration and repository tools.',
    version: '0.3.4',
    categories: ['DEVELOPER_TOOLS'],
    auth: { type: 'OAUTH2', description: 'Authenticate with your GitHub account.' },
    actions: {
      createIssue: {
        name: 'createIssue',
        displayName: 'Create Issue',
        description: 'Create a GitHub issue in a repository.',
        props: { title: property('Title'), body: property('Body') },
        requireAuth: true,
      },
      listIssues: {
        name: 'listIssues',
        displayName: 'List Issues',
        description: 'List issues of a repository.',
        props: {},
        requireAuth: false,
      },
    },
    triggers: {
      newIssue: {
        name: 'newIssue',
        displayName: 'New Issue',
        description: 'Triggers when a new issue is created.',
        type: 'POLLING',
        props: {},
      },
      onPush: {
        name: 'onPush',
        displayName: 'Push Event',
        description: 'Triggers on every push to a branch.',
        type: 'WEBHOOK',
        props: { branch: property('Branch') },
      },
    },
  }
}

export function seekPage<T>(data: T[]): { data: T[]; next: string | null; previous: string | null } {
  return { data, next: null, previous: null }
}

export function githubConnection(
  id: string,
  displayName: string,
  overrides: Partial<AppConnection> = {}
): AppConnection {
  return {
    id,
    created: '2026-01-15T10:00:00.000Z',
    updated: '2026-01-15T10:00:00.000Z',
    displayName,
    pieceName: 'github',
    pieceVersion: '0.3.4',
    type: 'OAUTH2',
    status: 'ACTIVE',
    externalId: `ext_${id}`,
    projectIds: ['proj_default'],
    ...overrides,
  }
}

export function slackConnection(
  id: string,
  displayName: string,
  overrides: Partial<AppConnection> = {}
): AppConnection {
  return {
    id,
    created: '2026-02-20T08:30:00.000Z',
    updated: '2026-02-21T09:00:00.000Z',
    displayName,
    pieceName: 'slack',
    pieceVersion: '0.2.1',
    type: 'SECRET_TEXT',
    status: 'ERROR',
    externalId: `ext_${id}`,
    projectIds: ['proj_default'],
    ...overrides,
  }
}

function authProperty(displayName: string, type: string, extra: Record<string, unknown> = {}) {
  return {
    displayName,
    description: `${displayName} of your account`,
    required: true,
    type,
    defaultValue: '',
    ...extra,
  }
}

export function customAuthMetadata(): PieceMetadata {
  return {
    ...githubMetadata(),
    name: 'veeva',
    displayName: 'Veeva Vault',
    description: 'Life sciences content management.',
    version: '1.1.0',
    auth: {
      type: 'CUSTOM_AUTH',
      description: 'Authenticate with your Veeva instance.',
      props: {
        username: authProperty('Username', 'SHORT_TEXT'),
        password: authProperty('Password', 'SECRET_TEXT'),
        vaultCount: authProperty('Vault count', 'NUMBER'),
        ssoEnabled: authProperty('SSO enabled', 'CHECKBOX'),
        region: authProperty('Region', 'STATIC_DROPDOWN', {
          options: {
            options: [
              { label: 'EU', value: 'eu' },
              { label: 'US', value: 'us' },
            ],
          },
        }),
      },
    },
  }
}

export function secretAuthMetadata(): PieceMetadata {
  return {
    ...githubMetadata(),
    name: 'slack',
    displayName: 'Slack',
    description: 'Team communication and messaging.',
    version: '0.2.1',
    auth: {
      type: 'SECRET_TEXT',
      description: 'Create a Slack bot user token.',
    },
    actions: {},
    triggers: {},
  }
}

export function basicAuthMetadata(): PieceMetadata {
  return {
    ...githubMetadata(),
    name: 'jira',
    displayName: 'Jira',
    description: 'Issue tracking for teams.',
    version: '0.9.0',
    auth: { type: 'BASIC_AUTH' },
    actions: {},
    triggers: {},
  }
}

export function runnerActionFixture() {
  return {
    name: 'createItem',
    displayName: 'Create Item',
    description: 'Creates an item with the given fields.',
    requireAuth: true,
    props: {
      title: {
        displayName: 'Title',
        required: true,
        type: 'SHORT_TEXT',
        description: 'Item title',
      },
      count: { displayName: 'Count', required: false, type: 'NUMBER' },
      publish: { displayName: 'Publish', required: false, type: 'CHECKBOX' },
      priority: {
        displayName: 'Priority',
        required: false,
        type: 'STATIC_DROPDOWN',
        options: {
          options: [
            { label: 'High', value: 'high' },
            { label: 'Low', value: { id: 1, name: 'low' } },
          ],
        },
      },
      token: { displayName: 'Token', required: false, type: 'SECRET_TEXT' },
      dueAt: { displayName: 'Due At', required: false, type: 'DATE_TIME' },
      payload: { displayName: 'Payload', required: false, type: 'JSON' },
      project: { displayName: 'Project', required: false, type: 'DROPDOWN' },
    },
  }
}

export function runnerMetadata(): PieceMetadata {
  return {
    ...githubMetadata(),
    name: 'runner',
    displayName: 'Runner',
    description: 'Runner integration for execution tests.',
    auth: { type: 'OAUTH2', description: 'Connect your Runner account.' },
    actions: {
      createItem: runnerActionFixture(),
    },
    triggers: {},
  }
}
