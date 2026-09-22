import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectError, InboxFM } from '../src/index'

function jsonResponse({ status, body, headers }: { status: number, body: unknown, headers?: Record<string, string> }): Response {
    return new Response(JSON.stringify(body), { status, headers })
}

function client(overrides: Partial<ConstructorParameters<typeof InboxFM>[0]> = {}): InboxFM {
    return new InboxFM({
        apiKey: 'test-key',
        projectId: 'project-a',
        baseUrl: 'https://api.example.com',
        retryBaseDelayMs: 1,
        retryMaxDelayMs: 5,
        ...overrides,
    })
}

describe('InboxFM transport', () => {
    let fetchMock: ReturnType<typeof vi.fn>

    beforeEach(() => {
        fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('sends the bearer token and project id on a successful GET', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 200, body: { data: [], next: null, previous: null } }))

        const result = await client().listConnections({ externalUserId: 'user_1' })

        expect(result).toEqual({ data: [], next: null, previous: null })
        const [url, init] = fetchMock.mock.calls[0]
        expect(String(url)).toContain('projectId=project-a')
        expect(init.headers.Authorization).toBe('Bearer test-key')
    })

    it('throws a typed ConnectError on a non-2xx response', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 404, body: { code: 'ENTITY_NOT_FOUND', params: { entityId: 'abc' } } }))

        await expect(client().listConnections({ externalUserId: 'user_1' })).rejects.toMatchObject({
            category: 'not_found',
            code: 'ENTITY_NOT_FOUND',
        })
    })

    it('retries a safe GET request on a transient network failure', async () => {
        fetchMock
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(jsonResponse({ status: 200, body: { data: [], next: null, previous: null } }))

        const result = await client().listConnections({ externalUserId: 'user_1' })

        expect(result).toEqual({ data: [], next: null, previous: null })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('does NOT retry a non-idempotent POST (execute) on a network failure, even with an idempotency key', async () => {
        fetchMock.mockRejectedValue(new TypeError('fetch failed'))

        await expect(
            client().execute({ integration: 'slack', tool: 'send_message', input: {}, idempotencyKey: 'key-1' }),
        ).rejects.toMatchObject({ category: 'network' })

        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('does NOT retry a non-idempotent POST (createConnectSession) on a 500 response', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ status: 500, body: { message: 'boom' } }))

        await expect(client().createConnectSession({ externalUserId: 'user_1' })).rejects.toMatchObject({ category: 'server' })

        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('retries a POST automatically on a 429 response, since the request was rejected before execution', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse({ status: 429, body: { code: 'PROJECT_RATE_LIMIT_EXCEEDED', params: {} } }))
            .mockResolvedValueOnce(jsonResponse({ status: 200, body: { token: 't', connectUrl: 'https://x', expiresAt: '2026-01-01' } }))

        const result = await client().createConnectSession({ externalUserId: 'user_1' })

        expect(result.token).toBe('t')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('lets a caller opt a mutation into retries explicitly via retryable: true', async () => {
        fetchMock
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(jsonResponse({ status: 200, body: { token: 't', connectUrl: 'https://x', expiresAt: '2026-01-01' } }))

        const result = await client().createConnectSession({ externalUserId: 'user_1', retryable: true })

        expect(result.token).toBe('t')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('retries deleteConnection (naturally idempotent) on a network failure by default', async () => {
        fetchMock
            .mockRejectedValueOnce(new TypeError('fetch failed'))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))

        await client().deleteConnection({ connectionId: 'conn_1' })

        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('gives up after exhausting max attempts and surfaces the last error', async () => {
        fetchMock.mockRejectedValue(new TypeError('fetch failed'))

        await expect(client({ maxAttempts: 2 }).listConnections({ externalUserId: 'user_1' })).rejects.toBeInstanceOf(ConnectError)
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('respects a caller-provided AbortSignal', async () => {
        const controller = new AbortController()
        fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
            if (init.signal.aborted) {
                reject(new DOMException('aborted', 'AbortError'))
                return
            }
            init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }))
        controller.abort()

        await expect(
            client().listConnections({ externalUserId: 'user_1', signal: controller.signal }),
        ).rejects.toMatchObject({ category: 'aborted' })
    })

    it('surfaces a timeout as a typed ConnectError', async () => {
        fetchMock.mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
            if (init.signal.aborted) {
                reject(new DOMException('aborted', 'AbortError'))
                return
            }
            init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }))

        await expect(
            client({ timeoutMs: 5, maxAttempts: 1 }).listConnections({ externalUserId: 'user_1' }),
        ).rejects.toMatchObject({ category: 'timeout' })
    })

    it('sends the Idempotency-Key header when provided', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse({ status: 200, body: { token: 't', connectUrl: 'https://x', expiresAt: '2026-01-01' } }))

        await client().createConnectSession({ externalUserId: 'user_1', idempotencyKey: 'key-42' })

        const [, init] = fetchMock.mock.calls[0]
        expect(init.headers['Idempotency-Key']).toBe('key-42')
    })

    it('scopes requests to the configured project id without leaking across clients', async () => {
        fetchMock.mockResolvedValue(jsonResponse({ status: 200, body: { data: [], next: null, previous: null } }))

        await client({ projectId: 'project-b' }).listConnections({ externalUserId: 'user_1' })

        const [url] = fetchMock.mock.calls[0]
        expect(String(url)).toContain('projectId=project-b')
        expect(String(url)).not.toContain('projectId=project-a')
    })
})
