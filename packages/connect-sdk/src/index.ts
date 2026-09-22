import { ConnectError } from './errors'
import { transport } from './transport'

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 250
const DEFAULT_MAX_DELAY_MS = 4_000

export class InboxFM {
    private readonly apiKey: string
    private readonly projectId: string
    private readonly baseUrl: string
    private readonly defaultTimeoutMs: number
    private readonly maxAttempts: number
    private readonly baseDelayMs: number
    private readonly maxDelayMs: number

    constructor({ apiKey, projectId, baseUrl, timeoutMs, maxAttempts, retryBaseDelayMs, retryMaxDelayMs }: InboxFMOptions) {
        this.apiKey = apiKey
        this.projectId = projectId
        this.baseUrl = baseUrl.replace(/\/+$/, '')
        this.defaultTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS
        this.maxAttempts = maxAttempts ?? DEFAULT_MAX_ATTEMPTS
        this.baseDelayMs = retryBaseDelayMs ?? DEFAULT_BASE_DELAY_MS
        this.maxDelayMs = retryMaxDelayMs ?? DEFAULT_MAX_DELAY_MS
    }

    async createConnectSession({ externalUserId, allowedPieceNames, expiresInSeconds, ...requestOptions }: CreateConnectSessionParams): Promise<CreateConnectSessionResult> {
        return this.request<CreateConnectSessionResult>('/v1/connect-sessions', {
            method: 'POST',
            body: {
                projectId: this.projectId,
                externalUserId,
                allowedPieceNames,
                expiresInSeconds,
            },
            ...requestOptions,
        })
    }

    async listConnections({ externalUserId, pieceName, ...requestOptions }: ListConnectionsParams): Promise<ListConnectionsResult> {
        const query = new URLSearchParams({ projectId: this.projectId, externalId: externalUserId })
        if (pieceName) {
            query.set('pieceName', pieceName)
        }
        return this.request<ListConnectionsResult>(`/v1/connections?${query.toString()}`, {
            method: 'GET',
            ...requestOptions,
        })
    }

    async execute({ integration, tool, connectionId, externalUserId, input, ...requestOptions }: ExecuteParams): Promise<unknown> {
        return this.request('/v1/execute', {
            method: 'POST',
            body: {
                projectId: this.projectId,
                integration,
                tool,
                connectionId,
                externalUserId,
                input,
            },
            ...requestOptions,
        })
    }

    async deleteConnection({ connectionId, ...requestOptions }: DeleteConnectionParams): Promise<void> {
        await this.request(`/v1/connections/${connectionId}`, {
            method: 'DELETE',
            retryable: true,
            ...requestOptions,
        })
    }

    private async request<T>(path: string, { method, body, ...requestOptions }: { method: string, body?: unknown } & ConnectRequestOptions): Promise<T> {
        return transport.request<T>({
            url: `${this.baseUrl}${path}`,
            method,
            body,
            apiKey: this.apiKey,
            timeoutMs: requestOptions.timeoutMs ?? this.defaultTimeoutMs,
            maxAttempts: this.maxAttempts,
            baseDelayMs: this.baseDelayMs,
            maxDelayMs: this.maxDelayMs,
            signal: requestOptions.signal,
            retryable: requestOptions.retryable,
            idempotencyKey: requestOptions.idempotencyKey,
        })
    }
}

export { ConnectError }
export type { ConnectErrorCategory, ConnectErrorOptions } from './errors'

export type ConnectRequestOptions = {
    signal?: AbortSignal
    timeoutMs?: number
    retryable?: boolean
    idempotencyKey?: string
}

export type InboxFMOptions = {
    apiKey: string
    projectId: string
    baseUrl: string
    timeoutMs?: number
    maxAttempts?: number
    retryBaseDelayMs?: number
    retryMaxDelayMs?: number
}

export type CreateConnectSessionParams = {
    externalUserId: string
    allowedPieceNames?: string[]
    expiresInSeconds?: number
} & ConnectRequestOptions

export type CreateConnectSessionResult = {
    token: string
    connectUrl: string
    expiresAt: string
}

export type ListConnectionsParams = {
    externalUserId: string
    pieceName?: string
} & ConnectRequestOptions

export type ListConnectionsResult = {
    data: Array<Record<string, unknown>>
    next: string | null
    previous: string | null
}

export type ExecuteParams = {
    integration: string
    tool: string
    connectionId?: string
    externalUserId?: string
    input: Record<string, unknown>
} & ConnectRequestOptions

export type DeleteConnectionParams = {
    connectionId: string
} & ConnectRequestOptions
