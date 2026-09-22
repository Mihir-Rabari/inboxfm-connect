import { describe, expect, it } from 'vitest'
import { connectErrorFactory } from '../src/errors'

function jsonResponse({ status, body, headers }: { status: number, body: unknown, headers?: Record<string, string> }): Response {
    return new Response(JSON.stringify(body), { status, headers })
}

describe('connectErrorFactory.fromResponse', () => {
    it('categorizes a 401 as authentication', async () => {
        const error = await connectErrorFactory.fromResponse({
            response: jsonResponse({ status: 401, body: { code: 'INVALID_BEARER_TOKEN', params: {} } }),
        })
        expect(error.category).toBe('authentication')
        expect(error.code).toBe('INVALID_BEARER_TOKEN')
        expect(error.retryable).toBe(false)
    })

    it('categorizes a 404 as not_found', async () => {
        const error = await connectErrorFactory.fromResponse({
            response: jsonResponse({ status: 404, body: { code: 'ENTITY_NOT_FOUND', params: {} } }),
        })
        expect(error.category).toBe('not_found')
    })

    it('distinguishes 409 validation from other 409 conflicts', async () => {
        const validationError = await connectErrorFactory.fromResponse({
            response: jsonResponse({ status: 409, body: { code: 'VALIDATION', params: {} } }),
        })
        expect(validationError.category).toBe('validation')

        const conflictError = await connectErrorFactory.fromResponse({
            response: jsonResponse({ status: 409, body: { code: 'EXISTING_USER', params: {} } }),
        })
        expect(conflictError.category).toBe('conflict')
    })

    it('categorizes a 429 as rate_limit and marks it retryable with retry-after', async () => {
        const error = await connectErrorFactory.fromResponse({
            response: jsonResponse({
                status: 429,
                body: { code: 'PROJECT_RATE_LIMIT_EXCEEDED', params: {} },
                headers: { 'Retry-After': '2' },
            }),
        })
        expect(error.category).toBe('rate_limit')
        expect(error.retryable).toBe(true)
        expect(error.retryAfterMs).toBe(2000)
    })

    it('categorizes a 500 as server and retryable', async () => {
        const error = await connectErrorFactory.fromResponse({
            response: jsonResponse({ status: 500, body: { message: 'boom' } }),
        })
        expect(error.category).toBe('server')
        expect(error.retryable).toBe(true)
    })

    it('never includes the Authorization header or api key in the serialized error', async () => {
        const error = await connectErrorFactory.fromResponse({
            response: jsonResponse({ status: 500, body: { message: 'boom' } }),
        })
        const serialized = JSON.stringify(error.toJSON())
        expect(serialized).not.toContain('Authorization')
        expect(serialized).not.toContain('Bearer')
    })
})

describe('connectErrorFactory network/timeout/abort', () => {
    it('marks network errors as retryable', () => {
        const error = connectErrorFactory.fromNetworkError({ cause: new Error('ECONNRESET') })
        expect(error.category).toBe('network')
        expect(error.retryable).toBe(true)
    })

    it('marks timeouts as retryable', () => {
        const error = connectErrorFactory.fromTimeout({ timeoutMs: 5000 })
        expect(error.category).toBe('timeout')
        expect(error.retryable).toBe(true)
        expect(error.message).toContain('5000')
    })

    it('marks caller aborts as not retryable', () => {
        const error = connectErrorFactory.fromAbort()
        expect(error.category).toBe('aborted')
        expect(error.retryable).toBe(false)
    })
})
