export const MCP_CLIENTS = ['claude-desktop', 'cursor', 'windsurf'] as const

export type McpClient = (typeof MCP_CLIENTS)[number]

export interface McpClientMeta {
  client: McpClient
  label: string
  configPath: string
  urlField: 'url' | 'serverUrl'
}

export const MCP_CLIENT_META: Record<McpClient, McpClientMeta> = {
  'claude-desktop': {
    client: 'claude-desktop',
    label: 'Claude Desktop',
    configPath: '%APPDATA%\\Claude\\claude_desktop_config.json (Windows) · ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)',
    urlField: 'url',
  },
  cursor: {
    client: 'cursor',
    label: 'Cursor',
    configPath: '.cursor/mcp.json (project) or ~/.cursor/mcp.json (global)',
    urlField: 'url',
  },
  windsurf: {
    client: 'windsurf',
    label: 'Windsurf',
    configPath: '~/.codeium/windsurf/mcp_config.json',
    urlField: 'serverUrl',
  },
}

export interface McpClientConfigParams {
  client: McpClient
  serverUrl: string
  bearerToken?: string
}

export function buildMcpClientConfig({ client, serverUrl, bearerToken }: McpClientConfigParams): string {
  const meta = MCP_CLIENT_META[client]
  const server: Record<string, unknown> = {
    [meta.urlField]: serverUrl,
  }
  if (bearerToken) {
    server['headers'] = {
      Authorization: `Bearer ${bearerToken}`,
    }
  }
  return JSON.stringify({ mcpServers: { inboxfm: server } }, null, 2)
}

export function fallbackMcpServerUrl(): string {
  if (typeof window === 'undefined') {
    return 'http://localhost:3000/mcp'
  }
  return `${window.location.origin}/mcp`
}
