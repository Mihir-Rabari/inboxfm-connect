import { PopulatedMcpServer } from '@/lib/api/types'
import { StubRoute } from '@/test/api-stub'

export const MCP_PROJECT_ID = 'proj_default'

export function mcpServer(overrides: Partial<PopulatedMcpServer> = {}): PopulatedMcpServer {
  return {
    id: 'mcp_server_1',
    created: '2026-08-01T09:00:00.000Z',
    updated: '2026-08-20T14:30:00.000Z',
    platformId: null,
    projectId: MCP_PROJECT_ID,
    type: 'PROJECT',
    token: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    disabledTools: ['ap_delete_table'],
    flows: [],
    ...overrides,
  }
}

export function mcpRoutes(options: {
  server?: PopulatedMcpServer
  getServer?: () => PopulatedMcpServer
  onUpdateStatus?: number
  onRotateStatus?: number
  onTokenStatus?: number
} = {}): StubRoute[] {
  const base = options.server ?? mcpServer()
  let current = base
  if (options.getServer) {
    current = options.getServer()
  }
  const projectPath = `/api/v1/projects/${MCP_PROJECT_ID}/mcp-server`
  return [
    {
      match: (url, method) =>
        url.pathname === projectPath && method === 'POST' &&
        !url.pathname.includes('rotate') && !url.pathname.includes('token'),
      respond: (_url, _method, body?: unknown) => {
        if (options.onUpdateStatus) {
          return { status: options.onUpdateStatus, body: { message: 'update failed' } }
        }
        const request = (body ?? {}) as { disabledTools?: string[] }
        current = { ...current, disabledTools: request.disabledTools ?? current.disabledTools }
        return { status: 200, body: current }
      },
    },
    {
      match: (url: URL) => url.pathname === projectPath,
      respond: () => ({ status: 200, body: current }),
    },
    {
      match: (url: URL) => url.pathname.endsWith('/mcp-server/rotate'),
      respond: () => {
        if (options.onRotateStatus) {
          return { status: options.onRotateStatus, body: { message: 'rotation failed' } }
        }
        current = mcpServer({ token: 'rotated_token_value_9999', updated: new Date().toISOString() })
        return { status: 200, body: current }
      },
    },
    {
      match: (url: URL) => url.pathname.endsWith('/mcp-server/token'),
      respond: () =>
        options.onTokenStatus
          ? { status: options.onTokenStatus, body: { message: 'token generation failed' } }
          : {
              status: 200,
              body: {
                mcpServerUrl: 'https://cloud.inboxfm.example/mcp',
                mcpToken: 'mcp_generated_token_abc123',
              },
            },
    },
  ]
}
