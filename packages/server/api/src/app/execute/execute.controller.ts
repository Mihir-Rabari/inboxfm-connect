import { ActivepiecesError, ErrorCode, isNil, tryCatch } from '@inboxfm-connect/core-utils'
import { HeadlessRuntime } from '@inboxfm-connect/runtime'
import { Permission, PrincipalType } from '@inboxfm-connect/shared'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { StatusCodes } from 'http-status-codes'
import { ArrayContains } from 'typeorm'
import { z } from 'zod'
import { appConnectionService, appConnectionsRepo } from '../app-connection/app-connection-service/app-connection-service'
import { ProjectResourceType } from '../core/security/authorization/common'
import { securityAccess } from '../core/security/authorization/fastify-security'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'

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
        return appConnectionService(console as any).decryptAndRefreshConnection(
            connection,
            projectId,
            console as any,
        )
    },
})

export const executeController: FastifyPluginAsyncZod = async (fastify) => {
    fastify.post('/', ExecuteRequestOptions, async (request) => {
        const publicUrl = await system.get(AppSystemProp.FRONTEND_URL) || 'http://localhost:3000'
        const connectionId = await resolveConnectionId({
            projectId: request.projectId,
            connectionId: request.body.connectionId,
            externalUserId: request.body.externalUserId,
            pieceName: request.body.integration,
        })

        const { data, error } = await tryCatch(() => runtime.execute({
            integration: request.body.integration,
            tool: request.body.tool,
            connectionId,
            input: request.body.input,
            projectId: request.projectId,
            platformId: request.principal.platform.id,
            internalApiUrl: publicUrl,
            publicApiUrl: publicUrl,
        }))
        if (error) {
            throw new ActivepiecesError({
                code: ErrorCode.ENGINE_OPERATION_FAILURE,
                params: {
                    message: error instanceof Error ? error.message : 'Failed to execute piece action',
                },
            })
        }
        return data
    })
}

async function resolveConnectionId({ projectId, connectionId, externalUserId, pieceName }: ResolveConnectionIdParams): Promise<string> {
    if (!isNil(connectionId)) {
        return connectionId
    }
    if (isNil(externalUserId)) {
        throw new ActivepiecesError({
            code: ErrorCode.VALIDATION,
            params: {
                message: 'Either connectionId or externalUserId must be provided',
            },
        })
    }
    const connection = await appConnectionsRepo().findOneBy({
        projectIds: ArrayContains([projectId]),
        pieceName,
        externalId: externalUserId,
    })
    if (isNil(connection)) {
        throw new ActivepiecesError({
            code: ErrorCode.ENTITY_NOT_FOUND,
            params: {
                entityType: 'app_connection',
                message: `No connection found for piece "${pieceName}" and externalUserId "${externalUserId}"`,
            },
        })
    }
    return connection.id
}

type ResolveConnectionIdParams = {
    projectId: string
    connectionId: string | undefined
    externalUserId: string | undefined
    pieceName: string
}

/**
 * `projectId` is required by the security layer, not by the runtime.
 * The route is configured with ProjectResourceType.BODY, and the authorization
 * hook runs at `preHandler` — after zod has already stripped unknown keys — so
 * the field must be declared here or every USER principal is rejected with
 * "Project ID is required". Membership + WRITE permission on the named project
 * are still enforced by the authorization layer.
 */
const ExecuteRequestBody = z.object({
    projectId: z.string().optional(),
    integration: z.string(),
    tool: z.string(),
    connectionId: z.string().optional(),
    externalUserId: z.string().optional(),
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
        description: 'Run a single piece action synchronously against one connection, resolved either by connectionId or by pieceName + externalUserId. Returns the raw action output.',
        body: ExecuteRequestBody,
        response: {
            [StatusCodes.OK]: z.unknown(),
        },
    },
}
