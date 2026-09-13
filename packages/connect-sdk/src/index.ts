export class InboxFM {
    private readonly apiKey: string
    private readonly projectId: string
    private readonly baseUrl: string

    constructor({ apiKey, projectId, baseUrl }: InboxFMOptions) {
        this.apiKey = apiKey
        this.projectId = projectId
        this.baseUrl = baseUrl.replace(/\/+$/, '')
    }

    async createConnectSession({ externalUserId, allowedPieceNames, expiresInSeconds }: CreateConnectSessionParams): Promise<CreateConnectSessionResult> {
        return this.request<CreateConnectSessionResult>('/v1/connect-sessions', {
            method: 'POST',
            body: {
                projectId: this.projectId,
                externalUserId,
                allowedPieceNames,
                expiresInSeconds,
            },
        })
    }

    async listConnections({ externalUserId, pieceName }: ListConnectionsParams): Promise<ListConnectionsResult> {
        const query = new URLSearchParams({ projectId: this.projectId, externalId: externalUserId })
        if (pieceName) {
            query.set('pieceName', pieceName)
        }
        return this.request<ListConnectionsResult>(`/v1/connections?${query.toString()}`, {
            method: 'GET',
        })
    }

    async execute({ integration, tool, connectionId, externalUserId, input }: ExecuteParams): Promise<unknown> {
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
        })
    }

    async deleteConnection(connectionId: string): Promise<void> {
        await this.request(`/v1/connections/${connectionId}`, {
            method: 'DELETE',
        })
    }

    private async request<T>(path: string, { method, body }: { method: string, body?: unknown }): Promise<T> {
        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.apiKey}`,
            },
            body: body ? JSON.stringify(body) : undefined,
        })
        if (!response.ok) {
            const errorBody = await response.text()
            throw new Error(`Inboxfm Connect API error (${response.status}): ${errorBody}`)
        }
        if (response.status === 204) {
            return undefined as T
        }
        return response.json() as Promise<T>
    }
}

export type InboxFMOptions = {
    apiKey: string
    projectId: string
    baseUrl: string
}

export type CreateConnectSessionParams = {
    externalUserId: string
    allowedPieceNames?: string[]
    expiresInSeconds?: number
}

export type CreateConnectSessionResult = {
    token: string
    connectUrl: string
    expiresAt: string
}

export type ListConnectionsParams = {
    externalUserId: string
    pieceName?: string
}

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
}
