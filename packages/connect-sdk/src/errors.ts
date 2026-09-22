export class ConnectError extends Error {
    readonly category: ConnectErrorCategory
    readonly status?: number
    readonly code?: string
    readonly params?: Record<string, unknown>
    readonly requestId?: string
    readonly retryable: boolean
    readonly retryAfterMs?: number

    constructor({ category, status, code, params, requestId, retryable, retryAfterMs, message, cause }: ConnectErrorOptions) {
        super(message, cause ? { cause } : undefined)
        this.name = 'ConnectError'
        this.category = category
        this.status = status
        this.code = code
        this.params = params
        this.requestId = requestId
        this.retryable = retryable
        this.retryAfterMs = retryAfterMs
        Object.setPrototypeOf(this, ConnectError.prototype)
    }

    toJSON(): Record<string, unknown> {
        return {
            name: this.name,
            message: this.message,
            category: this.category,
            status: this.status,
            code: this.code,
            params: this.params,
            requestId: this.requestId,
            retryable: this.retryable,
            retryAfterMs: this.retryAfterMs,
        }
    }
}

function categoryFromStatus({ status, code }: { status: number, code?: string }): ConnectErrorCategory {
    if (status === 401) {
        return 'authentication'
    }
    if (status === 403) {
        return 'authentication'
    }
    if (status === 404) {
        return 'not_found'
    }
    if (status === 429) {
        return 'rate_limit'
    }
    if (status === 409) {
        return code === 'VALIDATION' ? 'validation' : 'conflict'
    }
    if (status >= 500) {
        return 'server'
    }
    if (status >= 400) {
        return 'validation'
    }
    return 'unknown'
}

async function fromResponse({ response, requestId }: { response: Response, requestId?: string }): Promise<ConnectError> {
    const rawBody = await response.text()
    const parsed = parseErrorBody(rawBody)
    const category = categoryFromStatus({ status: response.status, code: parsed.code })
    return new ConnectError({
        category,
        status: response.status,
        code: parsed.code,
        params: parsed.params,
        requestId: requestId ?? response.headers.get('x-request-id') ?? undefined,
        retryable: response.status === 429 || response.status >= 500,
        retryAfterMs: parseRetryAfterMs({ header: response.headers.get('retry-after') }),
        message: parsed.message ?? `Inboxfm Connect API error (${response.status})`,
    })
}

function fromNetworkError({ cause }: { cause: unknown }): ConnectError {
    return new ConnectError({
        category: 'network',
        retryable: true,
        message: cause instanceof Error ? cause.message : 'Network request failed',
        cause,
    })
}

function fromTimeout({ timeoutMs }: { timeoutMs: number }): ConnectError {
    return new ConnectError({
        category: 'timeout',
        retryable: true,
        message: `Request timed out after ${timeoutMs}ms`,
    })
}

function fromAbort(): ConnectError {
    return new ConnectError({
        category: 'aborted',
        retryable: false,
        message: 'Request was aborted by the caller',
    })
}

function parseRetryAfterMs({ header }: { header: string | null }): number | undefined {
    if (!header) {
        return undefined
    }
    const seconds = Number(header)
    if (Number.isFinite(seconds)) {
        return Math.max(0, seconds * 1000)
    }
    const dateMs = Date.parse(header)
    if (Number.isNaN(dateMs)) {
        return undefined
    }
    return Math.max(0, dateMs - Date.now())
}

function parseErrorBody(rawBody: string): { code?: string, params?: Record<string, unknown>, message?: string } {
    if (!rawBody) {
        return {}
    }
    try {
        const body: unknown = JSON.parse(rawBody)
        if (typeof body !== 'object' || body === null) {
            return { message: rawBody }
        }
        const record = body as Record<string, unknown>
        const code = typeof record['code'] === 'string' ? record['code'] : undefined
        const params = typeof record['params'] === 'object' && record['params'] !== null
            ? record['params'] as Record<string, unknown>
            : undefined
        const message = typeof record['message'] === 'string' ? record['message'] : undefined
        return { code, params, message }
    }
    catch {
        return { message: rawBody }
    }
}

export const connectErrorFactory = {
    fromResponse,
    fromNetworkError,
    fromTimeout,
    fromAbort,
}

export type ConnectErrorCategory =
    | 'authentication'
    | 'validation'
    | 'not_found'
    | 'conflict'
    | 'rate_limit'
    | 'server'
    | 'network'
    | 'timeout'
    | 'aborted'
    | 'unknown'

export type ConnectErrorOptions = {
    category: ConnectErrorCategory
    retryable: boolean
    message: string
    status?: number
    code?: string
    params?: Record<string, unknown>
    requestId?: string
    retryAfterMs?: number
    cause?: unknown
}
