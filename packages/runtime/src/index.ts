import { createSandboxRuntime } from '@inboxfm-connect/sandbox'
import { EngineOperationType, PiecePackage, PackageType, PieceType } from '@inboxfm-connect/shared'

export class HeadlessRuntime {
    private sandboxRuntime: any

    constructor(private config: RuntimeConfig) {
        this.sandboxRuntime = createSandboxRuntime({
            concurrency: 1,
            basePath: config.basePath,
            getSettings: config.getSettings,
        })
    }

    async execute(params: ExecuteParams): Promise<unknown> {
        const connection = await this.config.database.getConnection({ connectionId: params.connectionId })
        if (!connection) {
            throw new Error(`Connection not found: ${params.connectionId}`)
        }

        const decryptedConnection = await this.config.decryptAndRefresh({ connection })
        const decryptedValue = decryptedConnection.value

        const piecePackage: PiecePackage = {
            packageType: PackageType.REGISTRY,
            pieceType: PieceType.OFFICIAL,
            pieceName: params.integration,
            pieceVersion: connection.pieceVersion,
        }

        const result = await this.sandboxRuntime.execute({
            workerIndex: 0,
            log: console as any,
            operationType: EngineOperationType.EXECUTE_TOOL,
            operation: {
                projectId: params.projectId,
                platformId: params.platformId,
                engineToken: 'headless',
                internalApiUrl: params.internalApiUrl || 'http://localhost:3000',
                publicApiUrl: params.publicApiUrl || 'http://localhost:3000',
                timeoutInSeconds: 60,
                pieceName: params.integration,
                pieceVersion: connection.pieceVersion,
                actionName: params.tool,
                input: params.input,
                auth: decryptedValue,
            },
            timeoutInSeconds: 60,
            provision: {
                platformId: params.platformId,
                pieces: [piecePackage],
                codes: [],
                publicApiUrl: params.publicApiUrl || 'http://localhost:3000',
                engineToken: 'headless',
            }
        })

        if (result.status !== 'OK') {
            throw new Error(result.error || `Execution failed with status: ${result.status}`)
        }

        return result.response
    }

    async connect(params: ConnectParams): Promise<unknown> {
        return this.config.database.saveConnection({ connection: params })
    }

    async disconnect(params: DisconnectParams): Promise<void> {
        await this.config.database.deleteConnection({ connectionId: params.connectionId })
    }

    async refreshToken(params: RefreshParams): Promise<unknown> {
        const connection = await this.config.database.getConnection({ connectionId: params.connectionId })
        if (!connection) {
            throw new Error(`Connection not found: ${params.connectionId}`)
        }
        return this.config.decryptAndRefresh({ connection })
    }

    async listTools(params: ListParams): Promise<unknown[]> {
        const piecePackage: PiecePackage = {
            packageType: PackageType.REGISTRY,
            pieceType: PieceType.OFFICIAL,
            pieceName: params.integration,
            pieceVersion: params.version || 'latest',
        }

        const result = await this.sandboxRuntime.execute({
            workerIndex: 0,
            log: console as any,
            operationType: EngineOperationType.EXTRACT_PIECE_METADATA,
            operation: {
                pieceName: params.integration,
                pieceVersion: params.version || 'latest',
                platformId: params.platformId,
                timeoutInSeconds: 60,
            },
            timeoutInSeconds: 60,
            provision: {
                platformId: params.platformId,
                pieces: [piecePackage],
                codes: [],
                publicApiUrl: params.publicApiUrl || 'http://localhost:3000',
                engineToken: 'headless',
            }
        })

        if (result.status !== 'OK') {
            throw new Error(result.error || `Failed to extract metadata: ${result.status}`)
        }

        const metadata = result.response as any
        return Object.values(metadata.actions || {}).map((action: any) => ({
            name: action.name,
            displayName: action.displayName,
            description: action.description,
            inputSchema: action.props,
        }))
    }

    async getConnection(params: GetConnectionParams): Promise<unknown> {
        const connection = await this.config.database.getConnection({ connectionId: params.connectionId })
        if (!connection) {
            throw new Error(`Connection not found: ${params.connectionId}`)
        }
        return this.config.decryptAndRefresh({ connection })
    }
}

export type RuntimeConfig = {
    basePath: string
    getSettings: () => any
    database: {
        getConnection(params: { connectionId: string }): Promise<any>
        saveConnection(params: { connection: any }): Promise<any>
        deleteConnection(params: { connectionId: string }): Promise<void>
    }
    decryptAndRefresh(params: { connection: any }): Promise<any>
}

export type ConnectParams = {
    integration: string
    value: unknown
    displayName: string
    pieceVersion?: string
}

export type DisconnectParams = {
    connectionId: string
}

export type ExecuteParams = {
    integration: string
    tool: string
    connectionId: string
    input: Record<string, unknown>
    projectId: string
    platformId: string
    internalApiUrl?: string
    publicApiUrl?: string
}

export type RefreshParams = {
    connectionId: string
}

export type ListParams = {
    integration: string
    platformId: string
    version?: string
    publicApiUrl?: string
}

export type GetConnectionParams = {
    connectionId: string
}
