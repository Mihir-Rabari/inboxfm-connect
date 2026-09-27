import { apId } from '@inboxfm-connect/core-utils'
import {
    AppConnectionType,
    ConnectionHealthStatus,
    EngineResponseStatus,
    PackageType,
    ProjectScopedMcpServer,
} from '@inboxfm-connect/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { userInteractionWatcher } from '../../../../src/app/helper/user-interaction/user-interaction-watcher'
import { apTestConnectionTool } from '../../../../src/app/mcp/tools/ap-test-connection'
import { pieceMetadataService } from '../../../../src/app/pieces/metadata/piece-metadata-service'
import { db } from '../../../helpers/db'
import { createMockPieceMetadata } from '../../../helpers/mocks'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null
let mockLog: FastifyBaseLogger

beforeAll(async () => {
    app = await setupTestEnvironment()
    mockLog = app!.log!
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('ap_test_connection MCP tool', () => {
    it('executes connection health check via MCP tool', async () => {
        const ctx = await createTestContext(app!)

        const mockPieceMetadata = createMockPieceMetadata({
            platformId: ctx.platform.id,
            packageType: PackageType.REGISTRY,
        })
        await db.save('integration_metadata', mockPieceMetadata)
        pieceMetadataService(mockLog).getOrThrow = vi.fn().mockResolvedValue(mockPieceMetadata)

        userInteractionWatcher.submitAndWaitForResponse = vi.fn().mockResolvedValue({
            status: EngineResponseStatus.OK,
            response: { valid: true },
        })

        const createResponse = await ctx.post('/v1/connections', {
            externalId: 'mcp-test-conn',
            displayName: 'MCP Healthy Conn',
            pieceName: mockPieceMetadata.name,
            projectId: ctx.project.id,
            type: AppConnectionType.SECRET_TEXT,
            value: {
                type: AppConnectionType.SECRET_TEXT,
                secret_text: 'key-1234',
            },
            pieceVersion: mockPieceMetadata.version,
        })
        const connection = createResponse?.json()

        const mcpServer: ProjectScopedMcpServer = {
            id: apId(),
            projectId: ctx.project.id,
            platformId: ctx.platform.id,
            type: 'PROJECT' as any,
            token: 'test-token',
            disabledTools: [],
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
        }

        const tool = apTestConnectionTool(mcpServer, mockLog)
        const result = await tool.execute({ connectionId: connection.id })

        expect(result.content[0].text).toContain('HEALTHY')
        expect((result.structuredContent as any).success).toBe(true)
        expect((result.structuredContent as any).status).toBe(ConnectionHealthStatus.HEALTHY)
    })
})
