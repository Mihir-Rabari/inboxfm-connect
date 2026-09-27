import { isNil, Permission } from '@inboxfm-connect/core-utils'
import { McpToolDefinition, ProjectScopedMcpServer } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains } from 'typeorm'
import { z } from 'zod'
import { appConnectionService, appConnectionsRepo } from '../../app-connection/app-connection-service/app-connection-service'
import { projectService } from '../../project/project-service'
import { mcpUtils } from './mcp-utils'

const testConnectionSchema = z.object({
    connectionId: z
        .string()
        .optional()
        .describe('The unique ID of the connection to test.'),
    externalId: z
        .string()
        .optional()
        .describe('The externalId / external reference of the connection to test.'),
    pieceName: z
        .string()
        .optional()
        .describe('Optional piece name to help locate the connection if externalId is used.'),
})

export const apTestConnectionTool = (mcp: ProjectScopedMcpServer, log: FastifyBaseLogger): McpToolDefinition => {
    return {
        title: 'ap_test_connection',
        permission: Permission.READ_APP_CONNECTION,
        description:
            'Test the health, validity, and responsiveness of an app/integration connection. Verifies authentication credentials before attempting actions.',
        inputSchema: {
            connectionId: testConnectionSchema.shape.connectionId,
            externalId: testConnectionSchema.shape.externalId,
            pieceName: testConnectionSchema.shape.pieceName,
        },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        execute: async (args) => {
            try {
                const params = testConnectionSchema.parse(args ?? {})
                const project = await projectService(log).getOneOrThrow(mcp.projectId)
                let resolvedConnectionId = params.connectionId

                if (isNil(resolvedConnectionId) && !isNil(params.externalId)) {
                    const found = await appConnectionsRepo().findOne({
                        where: {
                            projectIds: ArrayContains([mcp.projectId]),
                            platformId: project.platformId,
                            externalId: params.externalId,
                            ...(params.pieceName ? { pieceName: mcpUtils.normalizePieceName(params.pieceName) } : {}),
                        },
                    })
                    if (found) {
                        resolvedConnectionId = found.id
                    }
                }

                if (isNil(resolvedConnectionId)) {
                    return mcpUtils.mcpToolError('Failed to test connection', 'Please provide either a valid connectionId or externalId.')
                }

                const result = await appConnectionService(log).testConnection({
                    id: resolvedConnectionId,
                    projectId: mcp.projectId,
                    platformId: project.platformId,
                })

                const icon = result.success ? '✅' : '❌'
                const statusText = `${icon} Connection Health: ${result.status.toUpperCase()}\n- Success: ${result.success}\n- Message: ${result.message}\n- Response Time: ${result.responseTimeMs}ms\n- Tested At: ${result.testedAt}`

                return {
                    content: [{
                        type: 'text',
                        text: statusText,
                    }],
                    structuredContent: result,
                }
            }
            catch (err) {
                return mcpUtils.mcpToolError('Failed to test connection', err)
            }
        },
    }
}
