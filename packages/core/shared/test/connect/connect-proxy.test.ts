import { apId } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import {
    ALLOWED_PROXY_PROVIDERS,
    ConnectProxyErrorCode,
    ConnectProxyRequest,
    ConnectProxyResponse,
    ProxyHttpMethod,
    ProxyHttpMethodSchema,
} from '../../src/lib/connect-proxy'

describe('ConnectProxy contracts', () => {
    describe('ProxyHttpMethod and ProxyHttpMethodSchema', () => {
        it('validates supported HTTP methods', () => {
            expect(ProxyHttpMethodSchema.parse('GET')).toBe(ProxyHttpMethod.GET)
            expect(ProxyHttpMethodSchema.parse('POST')).toBe(ProxyHttpMethod.POST)
            expect(ProxyHttpMethodSchema.parse('PUT')).toBe(ProxyHttpMethod.PUT)
            expect(ProxyHttpMethodSchema.parse('PATCH')).toBe(ProxyHttpMethod.PATCH)
            expect(ProxyHttpMethodSchema.parse('DELETE')).toBe(ProxyHttpMethod.DELETE)
        })

        it('rejects unsupported methods like HEAD, OPTIONS, or lowercase get', () => {
            expect(() => ProxyHttpMethodSchema.parse('HEAD')).toThrow()
            expect(() => ProxyHttpMethodSchema.parse('OPTIONS')).toThrow()
            expect(() => ProxyHttpMethodSchema.parse('get')).toThrow()
        })
    })

    describe('ALLOWED_PROXY_PROVIDERS registry', () => {
        it('registers required default SaaS and developer providers', () => {
            const providers = Object.keys(ALLOWED_PROXY_PROVIDERS)
            expect(providers).toContain('slack')
            expect(providers).toContain('github')
            expect(providers).toContain('notion')
            expect(providers).toContain('hubspot')
            expect(providers).toContain('google')
            expect(providers).toContain('google_calendar')
            expect(providers).toContain('stripe')
            expect(providers).toContain('zendesk')
        })

        it('configures security and authentication defaults correctly', () => {
            const github = ALLOWED_PROXY_PROVIDERS.github
            expect(github.baseUrl).toBe('https://api.github.com')
            expect(github.authType).toBe('bearer')
            expect(github.defaultHeaders?.['Accept']).toBe('application/vnd.github+json')

            const zendesk = ALLOWED_PROXY_PROVIDERS.zendesk
            expect(zendesk.supportsSubdomain).toBe(true)
            expect(zendesk.subdomainRegex?.test('my-subdomain-123')).toBe(true)
            expect(zendesk.subdomainRegex?.test('invalid.domain')).toBe(false)
        })
    })

    describe('ConnectProxyRequest validation and security guards', () => {
        const baseValid = {
            projectId: apId(),
            externalUserId: 'cust_abc_123',
            provider: 'github',
            path: '/user/repos',
        }

        it('accepts minimal valid request and applies schema defaults', () => {
            const parsed = ConnectProxyRequest.parse(baseValid)
            expect(parsed.method).toBe(ProxyHttpMethod.GET)
            expect(parsed.timeoutMs).toBe(30000)
            expect(parsed.path).toBe('/user/repos')
        })

        it('accepts full request with body, custom headers, and query params', () => {
            const parsed = ConnectProxyRequest.parse({
                ...baseValid,
                method: ProxyHttpMethod.POST,
                path: '/repos/owner/repo/issues',
                headers: { 'X-Custom-Header': 'val' },
                query: { filter: 'open', page: 2, enabled: true, tags: ['bug', 'urgent'] },
                body: { title: 'Issue 123' },
                timeoutMs: 15000,
                idempotencyKey: 'idemp_key_1',
                connectionId: 'conn_123',
            })
            expect(parsed.method).toBe(ProxyHttpMethod.POST)
            expect(parsed.timeoutMs).toBe(15000)
            expect(parsed.idempotencyKey).toBe('idemp_key_1')
            expect(parsed.connectionId).toBe('conn_123')
        })

        describe('Path traversal and SSRF defense-in-depth rules', () => {
            it('rejects absolute URL scheme paths', () => {
                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, path: 'http://malicious.com/api' }),
                ).toThrowError(/cannot contain an absolute URL scheme/)

                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, path: 'https://malicious.com/api' }),
                ).toThrowError(/cannot contain an absolute URL scheme/)

                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, path: '//malicious.com/api' }),
                ).toThrowError(/cannot contain an absolute URL scheme/)
            })

            it('rejects backslashes in paths', () => {
                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, path: '/users\\info' }),
                ).toThrowError(/cannot contain backslashes/)
            })

            it('rejects ASCII control characters in paths', () => {
                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, path: '/users\x00info' }),
                ).toThrowError(/cannot contain control characters/)

                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, path: '/users\x1Finfo' }),
                ).toThrowError(/cannot contain control characters/)
            })

            it('rejects path traversal components ("..")', () => {
                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, path: '/api/../private' }),
                ).toThrowError(/directory traversal/)

                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, path: '../private' }),
                ).toThrowError(/directory traversal/)

                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, path: '/private/..' }),
                ).toThrowError(/directory traversal/)

                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, path: '..' }),
                ).toThrowError(/directory traversal/)
            })
        })

        describe('Subdomain validation', () => {
            it('accepts alphanumeric subdomain with hyphens', () => {
                const parsed = ConnectProxyRequest.parse({
                    ...baseValid,
                    subdomain: 'acme-prod-01',
                })
                expect(parsed.subdomain).toBe('acme-prod-01')
            })

            it('rejects subdomain containing periods, slashes, or special characters', () => {
                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, subdomain: 'acme.corp' }),
                ).toThrow()

                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, subdomain: 'acme/sub' }),
                ).toThrow()
            })
        })

        describe('Timeout boundaries', () => {
            it('rejects timeout below minimum 500ms', () => {
                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, timeoutMs: 499 }),
                ).toThrow()
            })

            it('rejects timeout above maximum 60,000ms', () => {
                expect(() =>
                    ConnectProxyRequest.parse({ ...baseValid, timeoutMs: 60001 }),
                ).toThrow()
            })

            it('accepts boundary timeout values', () => {
                expect(ConnectProxyRequest.parse({ ...baseValid, timeoutMs: 500 }).timeoutMs).toBe(500)
                expect(ConnectProxyRequest.parse({ ...baseValid, timeoutMs: 60000 }).timeoutMs).toBe(60000)
            })
        })
    })

    describe('ConnectProxyResponse schema', () => {
        it('validates a successful proxy response with optional rateLimit data', () => {
            const res = {
                status: 200,
                statusText: 'OK',
                headers: { 'content-type': 'application/json' },
                data: { user: { id: 123, name: 'Alice' } },
                provider: 'github',
                rateLimit: {
                    limit: 5000,
                    remaining: 4990,
                    reset: 1700000000,
                },
            }
            const parsed = ConnectProxyResponse.parse(res)
            expect(parsed.status).toBe(200)
            expect(parsed.provider).toBe('github')
            expect(parsed.rateLimit?.remaining).toBe(4990)
        })

        it('validates response with null data and without rateLimit', () => {
            const res = {
                status: 204,
                statusText: 'No Content',
                headers: {},
                data: null,
                provider: 'slack',
            }
            const parsed = ConnectProxyResponse.parse(res)
            expect(parsed.status).toBe(204)
            expect(parsed.data).toBeNull()
            expect(parsed.rateLimit).toBeUndefined()
        })
    })

    describe('ConnectProxyErrorCode constants', () => {
        it('exposes all standardized proxy error codes', () => {
            expect(ConnectProxyErrorCode.PROVIDER_NOT_SUPPORTED).toBe('PROVIDER_NOT_SUPPORTED')
            expect(ConnectProxyErrorCode.CONNECTION_NOT_FOUND).toBe('CONNECTION_NOT_FOUND')
            expect(ConnectProxyErrorCode.CROSS_CUSTOMER_FORBIDDEN).toBe('CROSS_CUSTOMER_FORBIDDEN')
            expect(ConnectProxyErrorCode.CROSS_PROJECT_FORBIDDEN).toBe('CROSS_PROJECT_FORBIDDEN')
            expect(ConnectProxyErrorCode.PROVIDER_MISMATCH).toBe('PROVIDER_MISMATCH')
            expect(ConnectProxyErrorCode.SSRF_BLOCKED).toBe('SSRF_BLOCKED')
            expect(ConnectProxyErrorCode.INVALID_PATH).toBe('INVALID_PATH')
            expect(ConnectProxyErrorCode.PAYLOAD_TOO_LARGE).toBe('PAYLOAD_TOO_LARGE')
            expect(ConnectProxyErrorCode.UPSTREAM_TIMEOUT).toBe('UPSTREAM_TIMEOUT')
            expect(ConnectProxyErrorCode.UPSTREAM_ERROR).toBe('UPSTREAM_ERROR')
        })
    })
})
