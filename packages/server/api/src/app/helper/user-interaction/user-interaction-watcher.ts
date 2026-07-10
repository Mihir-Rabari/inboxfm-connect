import { createSandboxRuntime } from '@inboxfm-connect/sandbox'
import { ActivepiecesError, ErrorCode, isNil } from '@inboxfm-connect/core-utils'
import { EngineOperationType, PiecePackage, WorkerJobType } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../system/system'
import { AppSystemProp } from '../system/system-props'

const sandboxRuntime = createSandboxRuntime({
    concurrency: 10,
    basePath: process.cwd(),
    getSettings: () => ({
        EXECUTION_MODE: system.get(AppSystemProp.EXECUTION_MODE) ?? 'UNSANDBOXED',
        SANDBOX_MEMORY_LIMIT: system.get(AppSystemProp.SANDBOX_MEMORY_LIMIT) ?? '1048576',
        FLOW_TIMEOUT_SECONDS: Number(system.get(AppSystemProp.FLOW_TIMEOUT_SECONDS) ?? '60'),
        MAX_FLOW_RUN_LOG_SIZE_MB: Number(system.get(AppSystemProp.MAX_FLOW_RUN_LOG_SIZE_MB) ?? '1'),
        MAX_FILE_SIZE_MB: Number(system.get(AppSystemProp.MAX_FILE_SIZE_MB) ?? '10'),
        NETWORK_MODE: (system.get(AppSystemProp.NETWORK_MODE) ?? 'STRICT') as any,
        DEV_PIECES: (system.get(AppSystemProp.DEV_PIECES) ?? '').split(',').map(s => s.trim()).filter(Boolean),
        WORKER_GROUP_ID: 'headless',
        PROJECT_WORKER: false,
    } as any)
})

const userInteractionWatcherImpl = {
    submitAndWaitForResponse: async <T>(request: any, log: FastifyBaseLogger): Promise<T> => {
        let operationType: EngineOperationType
        switch (request.jobType) {
            case WorkerJobType.EXECUTE_PROPERTY:
                operationType = EngineOperationType.EXECUTE_PROPERTY
                break
            case WorkerJobType.EXECUTE_VALIDATION:
                operationType = EngineOperationType.EXECUTE_VALIDATE_AUTH
                break
            case WorkerJobType.EXECUTE_TRIGGER_HOOK:
                operationType = EngineOperationType.EXECUTE_TRIGGER_HOOK
                break
            case WorkerJobType.EXECUTE_EXTRACT_PIECE_INFORMATION:
                operationType = EngineOperationType.EXTRACT_PIECE_METADATA
                break
            case WorkerJobType.EXECUTE_TOKEN_REFRESH:
                operationType = EngineOperationType.EXECUTE_REFRESH_TOKEN_AUTH
                break
            default:
                throw new Error(`Unsupported user interaction job type: ${request.jobType}`)
        }

        const piecePackage: PiecePackage = request.piece

        log.info({ jobType: request.jobType, pieceName: piecePackage.pieceName }, '[userInteractionWatcher] Executing user interaction job synchronously in-process')

        const result = await sandboxRuntime.execute({
            workerIndex: 0,
            log: log as any,
            operationType,
            operation: request,
            timeoutInSeconds: 60,
            provision: {
                platformId: request.platformId,
                pieces: [piecePackage],
                codes: [],
                publicApiUrl: 'http://localhost:3000',
                engineToken: 'headless',
            }
        })

        if (result.status !== 'OK') {
            throw new ActivepiecesError({
                code: ErrorCode.ENGINE_OPERATION_FAILURE,
                params: { message: result.error || `Execution failed with status: ${result.status}` },
            })
        }

        return result.response as T
    }
}

export const userInteractionWatcher = userInteractionWatcherImpl
export type UserInteractionWatcher = typeof userInteractionWatcherImpl
export type UserInteractionWatcherType = typeof userInteractionWatcherImpl
