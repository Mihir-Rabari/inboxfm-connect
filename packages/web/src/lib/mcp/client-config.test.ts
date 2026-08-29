import { describe, expect, it } from 'vitest'
import { buildMcpClientConfig, MCP_CLIENT_META } from './client-config'

const SERVER_URL = 'https://cloud.inboxfm.example/mcp'
const TOKEN = 'mcp_test_token_123'

describe('buildMcpClientConfig', () => {
  it('builds a Claude Desktop config with url only when no token is given', () => {
    const config = buildMcpClientConfig({ client: 'claude-desktop', serverUrl: SERVER_URL })
    const parsed = JSON.parse(config) as { mcpServers: Record<string, { url?: string; serverUrl?: string; headers?: unknown }> }
    const server = parsed.mcpServers.inboxfm
    expect(server.url).toBe(SERVER_URL)
    expect(server.serverUrl).toBeUndefined()
    expect(server.headers).toBeUndefined()
    expect(config).not.toContain('Bearer')
  })

  it('builds a Cursor config with url + bearer header when a token is provided', () => {
    const config = buildMcpClientConfig({ client: 'cursor', serverUrl: SERVER_URL, bearerToken: TOKEN })
    const parsed = JSON.parse(config) as {
      mcpServers: Record<string, { url?: string; headers?: Record<string, string> }>
    }
    const server = parsed.mcpServers.inboxfm
    expect(server.url).toBe(SERVER_URL)
    expect(server.headers?.Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('builds a Windsurf config using the serverUrl field', () => {
    const config = buildMcpClientConfig({ client: 'windsurf', serverUrl: SERVER_URL, bearerToken: TOKEN })
    const parsed = JSON.parse(config) as {
      mcpServers: Record<string, { url?: string; serverUrl?: string; headers?: Record<string, string> }>
    }
    const server = parsed.mcpServers.inboxfm
    expect(server.serverUrl).toBe(SERVER_URL)
    expect(server.url).toBeUndefined()
    expect(server.headers?.Authorization).toBe(`Bearer ${TOKEN}`)
  })

  it('only embeds a credential when explicitly provided', () => {
    for (const client of ['claude-desktop', 'cursor', 'windsurf'] as const) {
      const config = buildMcpClientConfig({ client, serverUrl: SERVER_URL })
      expect(config.includes(TOKEN)).toBe(false)
      expect(config.includes('headers')).toBe(false)
    }
  })

  it('documents config paths for every supported client', () => {
    expect(MCP_CLIENT_META['claude-desktop'].configPath).toContain('claude_desktop_config.json')
    expect(MCP_CLIENT_META.cursor.configPath).toContain('.cursor/mcp.json')
    expect(MCP_CLIENT_META.windsurf.configPath).toContain('mcp_config.json')
  })
})
