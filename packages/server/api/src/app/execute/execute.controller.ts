import { Permission, PrincipalType } from '@inboxfm-connect/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { z } from 'zod'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { HeadlessRuntime } from '@inboxfm-connect/runtime'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { appConnectionsRepo, appConnectionService } from '../app-connection/app-connection-service/app-connection-service'

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
        }
    },
    decryptAndRefresh: async ({ connection }) => {
        const projectId = connection.projectIds?.[0]
        if (!projectId) {
            throw new Error(`Connection has no projectIds: ${connection.id}`)
        }
        return appConnectionService(console as any).decryptAndRefreshConnection(
            connection,
            projectId,
            console as any
        )
    }
})

export const executeController: FastifyPluginAsyncZod = async (fastify) => {
    fastify.post('/', ExecuteRequestOptions, async (request) => {
        const publicUrl = await system.get(AppSystemProp.FRONTEND_URL) || 'http://localhost:3000'
        return runtime.execute({
            integration: request.body.integration,
            tool: request.body.tool,
            connectionId: request.body.connectionId,
            input: request.body.input,
            projectId: request.projectId,
            platformId: request.principal.platform.id,
            internalApiUrl: publicUrl,
            publicApiUrl: publicUrl,
        })
    })
}

const ExecuteRequestBody = z.object({
    integration: z.string(),
    tool: z.string(),
    connectionId: z.string(),
    input: z.record(z.string(), z.unknown()),
})

const ExecuteRequestOptions = {
    config: {
        security: securityAccess.project(
            [PrincipalType.USER, PrincipalType.ENGINE, PrincipalType.SERVICE],
            Permission.WRITE_APP_CONNECTION,
            { type: ProjectResourceType.BODY },
        ),
    },
    schema: {
        tags: ['execute'],
        body: ExecuteRequestBody,
        response: {
            [StatusCodes.OK]: z.unknown(),
        },
    },
}
