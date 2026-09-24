import { safeHttp } from '@inboxfm-connect/server-utils'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { redisConnections } from '../../../../src/app/database/redis-connections'
import { system } from '../../../../src/app/helper/system/system'
import { AppSystemProp, CaptchaProvider } from '../../../../src/app/helper/system/system-props'
import {
    createMockSignInRequest,
    createMockSignUpRequest,
} from '../../../helpers/mocks/authn'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

// Mirror the production defaults in system.ts (AppSystemProp.API_RATE_LIMIT_AUTHN_ABUSE_MAX
// / API_SIGN_IN_EMAIL_THROTTLE_MAX_ATTEMPTS). These are read eagerly at module load time
// (see core/security/rate-limit.ts), so tests exercise the real defaults rather than
// mocking a lower threshold.
const ABUSE_IP_MAX = 10
const EMAIL_THROTTLE_MAX_ATTEMPTS = 5

beforeAll(async () => {
    app = await setupTestEnvironment({ fresh: true })
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(async () => {
    await databaseConnection().getRepository('flag').createQueryBuilder().delete().execute()
    await databaseConnection().getRepository('project').createQueryBuilder().delete().execute()
    await databaseConnection().getRepository('platform').createQueryBuilder().delete().execute()
    await databaseConnection().getRepository('user').createQueryBuilder().delete().execute()
    await databaseConnection().getRepository('user_identity').createQueryBuilder().delete().execute()
})

afterEach(async () => {
    vi.restoreAllMocks()
    // This is a dedicated, ephemeral redis-memory-server instance for this test file
    // (see memory-redis.ts) — flushall is safe and avoids enumerating every key prefix
    // the rate limiter / throttle / underlying @fastify/rate-limit plugin might use.
    const redis = await redisConnections.useExisting()
    await redis.flushall()
})

describe('Sign-up / sign-in abuse protection', () => {
    describe('Per-IP abuse rate-limit tier', () => {
        it('allows sign-up up to the configured limit, then returns 429', async () => {
            const ip = '198.51.100.10'

            for (let i = 0; i < ABUSE_IP_MAX; i++) {
                const response = await app!.inject({
                    method: 'POST',
                    url: '/api/v1/authentication/sign-up',
                    headers: { 'x-real-ip': ip },
                    body: createMockSignUpRequest(),
                })
                expect(response.statusCode).toBe(StatusCodes.OK)
            }

            const throttled = await app!.inject({
                method: 'POST',
                url: '/api/v1/authentication/sign-up',
                headers: { 'x-real-ip': ip },
                body: createMockSignUpRequest(),
            })
            expect(throttled.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)
        })

        it('allows sign-in up to the configured limit, then returns 429', async () => {
            const ip = '198.51.100.20'
            const signUpRequest = createMockSignUpRequest()
            await app!.inject({
                method: 'POST',
                url: '/api/v1/authentication/sign-up',
                headers: { 'x-real-ip': ip },
                body: signUpRequest,
            })
            const signInRequest = createMockSignInRequest({ email: signUpRequest.email, password: signUpRequest.password })

            for (let i = 0; i < ABUSE_IP_MAX; i++) {
                const response = await app!.inject({
                    method: 'POST',
                    url: '/api/v1/authentication/sign-in',
                    headers: { 'x-real-ip': ip },
                    body: signInRequest,
                })
                expect(response.statusCode).toBe(StatusCodes.OK)
            }

            const throttled = await app!.inject({
                method: 'POST',
                url: '/api/v1/authentication/sign-in',
                headers: { 'x-real-ip': ip },
                body: signInRequest,
            })
            expect(throttled.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)
        })
    })

    describe('Per-email sign-in throttle', () => {
        it('blocks a single email after repeated failed attempts, even from different IPs', async () => {
            const signUpRequest = createMockSignUpRequest()
            await app!.inject({
                method: 'POST',
                url: '/api/v1/authentication/sign-up',
                headers: { 'x-real-ip': '198.51.100.30' },
                body: signUpRequest,
            })
            const wrongPasswordRequest = createMockSignInRequest({ email: signUpRequest.email, password: 'clearly-wrong-password' })

            for (let i = 0; i < EMAIL_THROTTLE_MAX_ATTEMPTS; i++) {
                const response = await app!.inject({
                    method: 'POST',
                    url: '/api/v1/authentication/sign-in',
                    headers: { 'x-real-ip': `198.51.100.${40 + i}` },
                    body: wrongPasswordRequest,
                })
                expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
                expect(response.json().code).toBe('INVALID_CREDENTIALS')
            }

            // A fresh IP does not reset the per-email counter, and even the CORRECT
            // password is blocked once the email itself is throttled — the block
            // happens before any password is checked.
            const correctPasswordRequest = createMockSignInRequest({ email: signUpRequest.email, password: signUpRequest.password })
            const blocked = await app!.inject({
                method: 'POST',
                url: '/api/v1/authentication/sign-in',
                headers: { 'x-real-ip': '198.51.100.99' },
                body: correctPasswordRequest,
            })
            expect(blocked.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS)
            expect(blocked.json().code).toBe('SIGN_IN_ATTEMPTS_EXCEEDED')
        })

        it('clears the counter on a successful sign-in', async () => {
            const signUpRequest = createMockSignUpRequest()
            await app!.inject({
                method: 'POST',
                url: '/api/v1/authentication/sign-up',
                headers: { 'x-real-ip': '198.51.100.50' },
                body: signUpRequest,
            })
            const wrongPasswordRequest = createMockSignInRequest({ email: signUpRequest.email, password: 'clearly-wrong-password' })

            for (let i = 0; i < EMAIL_THROTTLE_MAX_ATTEMPTS - 1; i++) {
                const response = await app!.inject({
                    method: 'POST',
                    url: '/api/v1/authentication/sign-in',
                    headers: { 'x-real-ip': `198.51.100.${60 + i}` },
                    body: wrongPasswordRequest,
                })
                expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
            }

            const correctPasswordRequest = createMockSignInRequest({ email: signUpRequest.email, password: signUpRequest.password })
            const success = await app!.inject({
                method: 'POST',
                url: '/api/v1/authentication/sign-in',
                headers: { 'x-real-ip': '198.51.100.70' },
                body: correctPasswordRequest,
            })
            expect(success.statusCode).toBe(StatusCodes.OK)

            // Counter was cleared by the success above, so a fresh run of failures
            // starts from zero again instead of being blocked immediately.
            for (let i = 0; i < EMAIL_THROTTLE_MAX_ATTEMPTS - 1; i++) {
                const response = await app!.inject({
                    method: 'POST',
                    url: '/api/v1/authentication/sign-in',
                    headers: { 'x-real-ip': `198.51.100.${80 + i}` },
                    body: wrongPasswordRequest,
                })
                expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
                expect(response.json().code).toBe('INVALID_CREDENTIALS')
            }
        })
    })

    describe('CAPTCHA on sign-up', () => {
        it('is a no-op when AP_CAPTCHA_PROVIDER is not set (default)', async () => {
            const response = await app!.inject({
                method: 'POST',
                url: '/api/v1/authentication/sign-up',
                headers: { 'x-real-ip': '198.51.100.110' },
                body: createMockSignUpRequest(),
            })
            expect(response.statusCode).toBe(StatusCodes.OK)
        })

        it('rejects sign-up without a captchaToken once a provider is configured', async () => {
            mockCaptchaConfigured({ provider: CaptchaProvider.TURNSTILE, secretKey: 'test-secret' })
            const postSpy: MockInstance = vi.spyOn(safeHttp.axios, 'post')

            const response = await app!.inject({
                method: 'POST',
                url: '/api/v1/authentication/sign-up',
                headers: { 'x-real-ip': '198.51.100.111' },
                body: createMockSignUpRequest(),
            })

            expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
            expect(response.json().code).toBe('CAPTCHA_VERIFICATION_FAILED')
            // A missing token is rejected locally, without an outbound call to the provider.
            expect(postSpy).not.toHaveBeenCalled()
        })

        it('verifies the token against the configured provider and allows sign-up on success', async () => {
            mockCaptchaConfigured({ provider: CaptchaProvider.TURNSTILE, secretKey: 'test-secret' })
            const postSpy: MockInstance = vi.spyOn(safeHttp.axios, 'post')
            postSpy.mockImplementation(async () => ({ data: { success: true } }))

            const response = await app!.inject({
                method: 'POST',
                url: '/api/v1/authentication/sign-up',
                headers: { 'x-real-ip': '198.51.100.112' },
                body: { ...createMockSignUpRequest(), captchaToken: 'valid-token' },
            })

            expect(response.statusCode).toBe(StatusCodes.OK)
            expect(postSpy).toHaveBeenCalledWith(
                'https://challenges.cloudflare.com/turnstile/v0/siteverify',
                expect.any(String),
                expect.anything(),
            )
        })

        it('rejects sign-up when the provider reports the token as invalid', async () => {
            mockCaptchaConfigured({ provider: CaptchaProvider.HCAPTCHA, secretKey: 'test-secret' })
            const postSpy: MockInstance = vi.spyOn(safeHttp.axios, 'post')
            postSpy.mockImplementation(async () => ({ data: { success: false } }))

            const response = await app!.inject({
                method: 'POST',
                url: '/api/v1/authentication/sign-up',
                headers: { 'x-real-ip': '198.51.100.113' },
                body: { ...createMockSignUpRequest(), captchaToken: 'invalid-token' },
            })

            expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
            expect(response.json().code).toBe('CAPTCHA_VERIFICATION_FAILED')
        })

        it('rejects sign-up when the provider request itself fails', async () => {
            mockCaptchaConfigured({ provider: CaptchaProvider.HCAPTCHA, secretKey: 'test-secret' })
            const postSpy: MockInstance = vi.spyOn(safeHttp.axios, 'post')
            postSpy.mockImplementation(async () => {
                throw new Error('network error')
            })

            const response = await app!.inject({
                method: 'POST',
                url: '/api/v1/authentication/sign-up',
                headers: { 'x-real-ip': '198.51.100.114' },
                body: { ...createMockSignUpRequest(), captchaToken: 'some-token' },
            })

            expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
            expect(response.json().code).toBe('CAPTCHA_VERIFICATION_FAILED')
        })
    })
})

function mockCaptchaConfigured({ provider, secretKey }: { provider: CaptchaProvider, secretKey: string }): void {
    const originalGet = system.get.bind(system)
    const originalGetOrThrow = system.getOrThrow.bind(system)
    const getSpy: MockInstance = vi.spyOn(system, 'get')
    getSpy.mockImplementation((prop: AppSystemProp) => {
        if (prop === AppSystemProp.CAPTCHA_PROVIDER) {
            return provider
        }
        return originalGet(prop)
    })
    const getOrThrowSpy: MockInstance = vi.spyOn(system, 'getOrThrow')
    getOrThrowSpy.mockImplementation((prop: AppSystemProp) => {
        if (prop === AppSystemProp.CAPTCHA_SECRET_KEY) {
            return secretKey
        }
        return originalGetOrThrow(prop)
    })
}
