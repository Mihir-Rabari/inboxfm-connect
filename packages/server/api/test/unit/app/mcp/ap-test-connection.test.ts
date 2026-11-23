import { apId, Permission } from '@inboxfm-connect/core-utils'
import { AppConnectionStatus, McpServerType, ProjectScopedMcpServer } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apTestConnectionTool } from '../../../../src/app/mcp/tools/ap-test-connection'

const mockTestConnection = vi.fn()
const mockFindOne = vi.fn()
const mockGetOneOrThrow = vi.fn()

vi.mock('../../../../src/app/app-connection/app-connection-service/app-connection-service', () => ({
    appConnectionService: () => ({
        testConnection: mockTestConnection,
    }),
    appConnectionsRepo: () => ({
        findOne: mockFindOne,
    }),
}))

vi.mock('../../../../src/app/project/project-service', () => ({
    projectService: () => ({
        getOneOrThrow: mockGetOneOrThrow,
    }),
}))

const mockLog = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
} as unknown as FastifyBaseLogger

const mcpServer: ProjectScopedMcpServer = {
    id: apId(),
    projectId: 'proj_123',
    platformId: 'plat_123',
    type: McpServerType.PROJECT,
    token: 'test-token',
    disabledTools: [],
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
}

describe('apTestConnectionTool unit tests', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGetOneOrThrow.mockResolvedValue({
            id: 'proj_123',
            platformId: 'plat_123',
        })
    })

    it('has correct tool definition and permissions', () => {
        const tool = apTestConnectionTool(mcpServer, mockLog)
        expect(tool.title).toBe('ap_test_connection')
        expect(tool.permission).toBe(Permission.READ_APP_CONNECTION)
        expect(tool.annotations?.readOnlyHint).toBe(true)
        expect(tool.annotations?.idempotentHint).toBe(true)
    })

    it('returns an error if neither connectionId nor externalId is provided', async () => {
        const tool = apTestConnectionTool(mcpServer, mockLog)
        const result = await tool.execute({})
        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('Please provide either a valid connectionId or externalId')
    })

    it('tests connection successfully using connectionId', async () => {
        mockTestConnection.mockResolvedValue({
            ok: true,
            status: AppConnectionStatus.ACTIVE,
            testedAt: '2026-10-05T00:00:00.000Z',
        })

        const tool = apTestConnectionTool(mcpServer, mockLog)
        const result = await tool.execute({ connectionId: 'conn_1' })

        expect(mockTestConnection).toHaveBeenCalledWith({
            id: 'conn_1',
            projectId: 'proj_123',
            platformId: 'plat_123',
        })
        expect(result.isError).toBeFalsy()
        expect(result.content[0].text).toContain('✅ Connection Health: ACTIVE')
        expect(result.content[0].text).toContain('- OK: true')
        expect(result.structuredContent).toEqual({
            ok: true,
            status: AppConnectionStatus.ACTIVE,
            testedAt: '2026-10-05T00:00:00.000Z',
        })
    })

    it('resolves connection by externalId and runs test', async () => {
        mockFindOne.mockResolvedValue({
            id: 'conn_resolved',
            externalId: 'ext_slack',
            pieceName: '@inboxfm-connect/piece-slack',
        })

        mockTestConnection.mockResolvedValue({
            ok: true,
            status: AppConnectionStatus.ACTIVE,
            testedAt: '2026-10-05T00:00:00.000Z',
        })

        const tool = apTestConnectionTool(mcpServer, mockLog)
        const result = await tool.execute({ externalId: 'ext_slack', pieceName: 'slack' })

        expect(mockFindOne).toHaveBeenCalled()
        expect(mockTestConnection).toHaveBeenCalledWith({
            id: 'conn_resolved',
            projectId: 'proj_123',
            platformId: 'plat_123',
        })
        expect(result.content[0].text).toContain('✅ Connection Health: ACTIVE')
    })

    it('returns error if connection with externalId is not found', async () => {
        mockFindOne.mockResolvedValue(null)

        const tool = apTestConnectionTool(mcpServer, mockLog)
        const result = await tool.execute({ externalId: 'nonexistent' })

        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('Connection with externalId "nonexistent" not found.')
        expect(mockTestConnection).not.toHaveBeenCalled()
    })

    it('handles unhealthy connection status response properly', async () => {
        mockTestConnection.mockResolvedValue({
            ok: false,
            status: AppConnectionStatus.ERROR,
            testedAt: '2026-10-05T00:00:00.000Z',
            message: 'OAuth refresh token expired.',
        })

        const tool = apTestConnectionTool(mcpServer, mockLog)
        const result = await tool.execute({ connectionId: 'conn_expired' })

        expect(result.content[0].text).toContain('❌ Connection Health: ERROR')
        expect(result.content[0].text).toContain('- OK: false')
        expect(result.content[0].text).toContain('- Message: OAuth refresh token expired.')
    })

    it('catches and formats errors thrown by testConnection', async () => {
        mockTestConnection.mockRejectedValue(new Error('Network failure during handshake'))

        const tool = apTestConnectionTool(mcpServer, mockLog)
        const result = await tool.execute({ connectionId: 'conn_fail' })

        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('❌ Failed to test connection: Network failure during handshake')
    })
})
