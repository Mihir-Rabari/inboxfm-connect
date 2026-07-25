import { HeadlessRuntime } from '@inboxfm-connect/runtime'
import { McpToolResult } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { ArrayContains } from 'typeorm'
import { appConnectionService, appConnectionsRepo } from '../../app-connection/app-connection-service/app-connection-service'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { projectService } from '../../project/project-service'

const runtime = new HeadlessRuntime({
    basePath: process.cwd(),
    getSettings: () => ({
        EXECUTION_MODE: system.get(AppSystemProp.EXECUTION_MODE) ?? 'UNSANDBOXED',
        SANDBOX_MEMORY_LIMIT: system.get(AppSystemProp.SANDBOX_MEMORY_LIMIT) ?? '1048576',
        FLOW_TIMEOUT_SECONDS: Number(system.get(AppSystemProp.FLOW_TIMEOUT_SECONDS) ?? '60'),
        MAX_FLOW_RUN_LOG_SIZE_MB: Number(system.get(AppSystemProp.MAX_FLOW_RUN_LOG_SIZE_MB) ?? '1'),
        MAX_FILE_SIZE_MB: Number(system.get(AppSystemProp.MAX_FILE_SIZE_MB) ?? '10'),
        NETWORK_MODE: system.get(AppSystemProp.NETWORK_MODE) ?? 'STRICT',
        DEV_PIECES: system.get(AppSystemProp.DEV_PIECES) ?? '',
        WORKER_GROUP_ID: 'headless',
        PROJECT_WORKER: 'false',
    }),
    database: {
        async getConnection({ connectionId }) {
            const connection = await appConnectionsRepo().findOneBy({ id: connectionId })
            return connection ?? null
        },
        async saveConnection({ connection }) {
            await appConnectionsRepo().upsert(connection, ['id'])
        },
        async deleteConnection({ connectionId }) {
            await appConnectionsRepo().delete({ id: connectionId })
        },
    },
    decryptAndRefresh: async ({ connection }) => {
        const projectId = connection.projectIds?.[0]
        if (!projectId) {
            throw new Error(`Connection has no projectIds: ${connection.id}`)
        }
        return appConnectionService({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, trace: () => {}, child: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, trace: () => {} }) } as unknown as FastifyBaseLogger).decryptAndRefreshConnection(
            connection,
            projectId,
            { info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, trace: () => {}, child: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, trace: () => {} }) } as unknown as FastifyBaseLogger,
        )
    },
})

export async function executeAdhocAction({
    projectId,
    pieceName,
    actionName,
    input = {},
    connectionExternalId,
    log,
}: {
    projectId: string
    pieceName: string
    actionName: string
    input?: Record<string, unknown>
    connectionExternalId?: string
    log: FastifyBaseLogger
}): Promise<McpToolResult> {
    const project = await projectService(log).getOneOrThrow(projectId)
    
    let connectionId: string | undefined
    if (connectionExternalId) {
        const connection = await appConnectionsRepo().findOneBy({
            projectIds: ArrayContains([projectId]),
            externalId: connectionExternalId,
        })
        if (connection) {
            connectionId = connection.id
        }
    }
    if (!connectionId) {
        // Find any connection in the project for this piece
        const connection = await appConnectionsRepo().findOneBy({
            projectIds: ArrayContains([projectId]),
            pieceName,
        })
        if (connection) {
            connectionId = connection.id
        }
    }
    if (!connectionId) {
        // Find any connection in the project
        const connection = await appConnectionsRepo().findOneBy({
            projectIds: ArrayContains([projectId]),
        })
        if (connection) {
            connectionId = connection.id
        }
    }
    if (!connectionId) {
        throw new Error('A connection must be created first before executing a tool.')
    }

    const publicUrl = system.get(AppSystemProp.FRONTEND_URL) || 'http://localhost:3000'
    const result = await runtime.execute({
        integration: pieceName,
        tool: actionName,
        connectionId,
        input,
        projectId,
        platformId: project.platformId,
        internalApiUrl: publicUrl,
        publicApiUrl: publicUrl,
    })

    const text = `Result:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``
    return { content: [{ type: 'text', text }] }
}
