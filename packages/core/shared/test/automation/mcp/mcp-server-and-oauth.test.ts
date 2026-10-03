import { apId } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import {
    MCP_TRIGGER_PIECE_NAME,
    McpOAuthAuthorizationCode,
    McpOAuthClient,
    McpOAuthToken,
    McpProperty,
    McpPropertyType,
    McpServer,
    McpServerType,
    McpTrigger,
    PopulatedMcpServer,
    UpdateMcpServerRequest,
} from '../../../src/lib/automation/mcp'

describe('MCP Server and OAuth Contracts (#141)', () => {
    describe('Constants and Enums', () => {
        it('exports the standard MCP trigger piece name', () => {
            expect(MCP_TRIGGER_PIECE_NAME).toBe('@inboxfm-connect/piece-mcp')
        })

        it('defines valid McpServerType enum members', () => {
            expect(McpServerType.PLATFORM).toBe('PLATFORM')
            expect(McpServerType.PROJECT).toBe('PROJECT')
        })

        it('defines valid McpPropertyType enum members', () => {
            expect(McpPropertyType.TEXT).toBe('Text')
            expect(McpPropertyType.BOOLEAN).toBe('Boolean')
            expect(McpPropertyType.DATE).toBe('Date')
            expect(McpPropertyType.NUMBER).toBe('Number')
            expect(McpPropertyType.ARRAY).toBe('Array')
            expect(McpPropertyType.OBJECT).toBe('Object')
        })
    })

    describe('McpServer schema', () => {
        it('parses a valid platform-scoped McpServer', () => {
            const platformId = apId()
            const raw = {
                id: apId(),
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                platformId,
                projectId: null,
                type: McpServerType.PLATFORM,
                token: apId(),
                disabledTools: null,
            }
            const parsed = McpServer.parse(raw)
            expect(parsed.platformId).toBe(platformId)
            expect(parsed.type).toBe(McpServerType.PLATFORM)
            expect(parsed.disabledTools).toBeNull()
        })

        it('parses a valid project-scoped McpServer with disabledTools', () => {
            const projectId = apId()
            const raw = {
                id: apId(),
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                platformId: null,
                projectId,
                type: McpServerType.PROJECT,
                token: apId(),
                disabledTools: ['tool_read_file', 'tool_exec'],
            }
            const parsed = McpServer.parse(raw)
            expect(parsed.projectId).toBe(projectId)
            expect(parsed.disabledTools).toEqual(['tool_read_file', 'tool_exec'])
        })

        it('rejects invalid McpServerType', () => {
            const raw = {
                id: apId(),
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                platformId: null,
                projectId: apId(),
                type: 'ORGANIZATION',
                token: apId(),
                disabledTools: null,
            }
            const result = McpServer.safeParse(raw)
            expect(result.success).toBe(false)
        })

        it('rejects missing or malformed token', () => {
            const raw = {
                id: apId(),
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                platformId: null,
                projectId: apId(),
                type: McpServerType.PROJECT,
                disabledTools: null,
            }
            const result = McpServer.safeParse(raw)
            expect(result.success).toBe(false)
        })
    })

    describe('PopulatedMcpServer schema', () => {
        it('parses server populated with attached flows', () => {
            const raw = {
                id: apId(),
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                platformId: null,
                projectId: apId(),
                type: McpServerType.PROJECT,
                token: apId(),
                disabledTools: [],
                flows: [{ id: 'flow-1', name: 'Order Processing' }, { id: 'flow-2', name: 'Invoice Sync' }],
            }
            const parsed = PopulatedMcpServer.parse(raw)
            expect(parsed.flows).toHaveLength(2)
        })
    })

    describe('UpdateMcpServerRequest schema', () => {
        it('accepts an empty update object', () => {
            const parsed = UpdateMcpServerRequest.parse({})
            expect(parsed.disabledTools).toBeUndefined()
        })

        it('accepts an update with an explicit list of disabled tools', () => {
            const parsed = UpdateMcpServerRequest.parse({ disabledTools: ['tool-a', 'tool-b'] })
            expect(parsed.disabledTools).toEqual(['tool-a', 'tool-b'])
        })

        it('rejects non-array disabledTools', () => {
            const result = UpdateMcpServerRequest.safeParse({ disabledTools: 'tool-a' })
            expect(result.success).toBe(false)
        })
    })

    describe('McpOAuthClient schema', () => {
        it('parses a valid OAuth client with redirect URIs and grant types', () => {
            const raw = {
                id: 'client_rec_1234567890',
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                clientId: 'client-xyz-123',
                clientSecret: 'secret-xyz-abc',
                clientSecretExpiresAt: 1735689600,
                clientIdIssuedAt: 1704067200,
                redirectUris: ['https://example.com/oauth/callback', 'http://localhost:3000/callback'],
                clientName: 'Cursor AI Client',
                grantTypes: ['authorization_code', 'refresh_token'],
                tokenEndpointAuthMethod: 'client_secret_post',
            }
            const parsed = McpOAuthClient.parse(raw)
            expect(parsed.clientId).toBe('client-xyz-123')
            expect(parsed.redirectUris).toHaveLength(2)
            expect(parsed.clientSecretExpiresAt).toBe(1735689600)
        })

        it('allows null clientSecret for public clients', () => {
            const raw = {
                id: 'client_rec_1234567890',
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                clientId: 'public-client',
                clientSecret: null,
                clientSecretExpiresAt: 0,
                clientIdIssuedAt: 1704067200,
                redirectUris: ['http://localhost:3000/callback'],
                clientName: null,
                grantTypes: ['authorization_code'],
                tokenEndpointAuthMethod: 'none',
            }
            const parsed = McpOAuthClient.parse(raw)
            expect(parsed.clientSecret).toBeNull()
            expect(parsed.clientName).toBeNull()
        })
    })

    describe('McpOAuthToken schema', () => {
        it('parses initial issued token with familyId and null previousRefreshToken', () => {
            const raw = {
                id: 'tok_rec_123456789012',
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                refreshToken: 'refresh-token-hash-1',
                previousRefreshToken: null,
                familyId: 'family-root-123',
                clientId: 'client-123',
                userId: 'user-456',
                projectId: 'proj-789',
                platformId: 'plat-abc',
                scopes: ['mcp:read', 'mcp:execute'],
                expiresAt: '2026-10-08T00:00:00.000Z',
                revoked: false,
            }
            const parsed = McpOAuthToken.parse(raw)
            expect(parsed.familyId).toBe('family-root-123')
            expect(parsed.previousRefreshToken).toBeNull()
            expect(parsed.revoked).toBe(false)
        })

        it('parses rotated token recording previousRefreshToken lineage', () => {
            const raw = {
                id: 'tok_rec_123456789013',
                created: '2026-10-02T00:00:00.000Z',
                updated: '2026-10-02T00:00:00.000Z',
                refreshToken: 'refresh-token-hash-2',
                previousRefreshToken: 'refresh-token-hash-1',
                familyId: 'family-root-123',
                clientId: 'client-123',
                userId: 'user-456',
                projectId: null,
                platformId: 'plat-abc',
                scopes: null,
                expiresAt: '2026-10-09T00:00:00.000Z',
                revoked: false,
            }
            const parsed = McpOAuthToken.parse(raw)
            expect(parsed.previousRefreshToken).toBe('refresh-token-hash-1')
            expect(parsed.projectId).toBeNull()
            expect(parsed.scopes).toBeNull()
        })
    })

    describe('McpOAuthAuthorizationCode schema', () => {
        it('parses a valid PKCE authorization code', () => {
            const raw = {
                id: 'code_rec_1234567890',
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                code: 'auth-code-secret-value',
                clientId: 'client-123',
                userId: 'user-456',
                projectId: 'proj-789',
                platformId: 'plat-abc',
                redirectUri: 'https://example.com/callback',
                codeChallenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
                codeChallengeMethod: 'S256',
                scopes: ['mcp:execute'],
                state: 'client-state-nonce',
                expiresAt: '2026-10-01T00:10:00.000Z',
                used: false,
            }
            const parsed = McpOAuthAuthorizationCode.parse(raw)
            expect(parsed.codeChallengeMethod).toBe('S256')
            expect(parsed.used).toBe(false)
            expect(parsed.state).toBe('client-state-nonce')
        })
    })

    describe('McpProperty and McpTrigger schemas', () => {
        it('validates property definitions with type and required flags', () => {
            const prop = McpProperty.parse({
                name: 'filterQuery',
                description: 'Search string for orders',
                type: McpPropertyType.TEXT,
                required: true,
            })
            expect(prop.name).toBe('filterQuery')
            expect(prop.required).toBe(true)
            expect(prop.type).toBe('Text')
        })

        it('validates McpTrigger with nested tool input specification', () => {
            const raw = {
                pieceName: MCP_TRIGGER_PIECE_NAME,
                triggerName: 'execute_tool',
                input: {
                    toolName: 'queryDatabase',
                    toolDescription: 'Execute a read query against analytics database',
                    inputSchema: [
                        {
                            name: 'query',
                            description: 'SQL SELECT query',
                            type: McpPropertyType.TEXT,
                            required: true,
                        },
                        {
                            name: 'maxRows',
                            description: 'Row limit',
                            type: McpPropertyType.NUMBER,
                            required: false,
                        },
                    ],
                    returnsResponse: true,
                },
            }
            const parsed = McpTrigger.parse(raw)
            expect(parsed.input.toolName).toBe('queryDatabase')
            expect(parsed.input.inputSchema).toHaveLength(2)
            expect(parsed.input.returnsResponse).toBe(true)
        })

        it('rejects McpTrigger missing required tool input fields', () => {
            const raw = {
                pieceName: MCP_TRIGGER_PIECE_NAME,
                triggerName: 'execute_tool',
                input: {
                    toolName: 'broken',
                },
            }
            const result = McpTrigger.safeParse(raw)
            expect(result.success).toBe(false)
        })
    })
})
