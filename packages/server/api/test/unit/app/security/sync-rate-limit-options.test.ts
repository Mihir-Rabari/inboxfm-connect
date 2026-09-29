import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppSystemProp } from '@/app/helper/system/system-props'

/**
 * Blocking finding on #242: AP_API_RATE_LIMIT_SYNC_ENABLED=false has to disable
 * the sync tier even though API_RATE_LIMIT_AUTHN_ENABLED defaults to true and
 * keeps the shared @fastify/rate-limit plugin registered. The integration test
 * (sync-execution-rate-limit-disabled.test.ts) proves it end-to-end; these
 * pin the resolution logic itself so the guarantee is cheap to re-verify and
 * fails loudly if someone reintroduces a shared/derived default.
 */
describe('sync execution rate-limit tier resolution', () => {
    const ENV_KEYS = [
        AppSystemProp.API_RATE_LIMIT_SYNC_ENABLED,
        AppSystemProp.API_RATE_LIMIT_AUTHN_ENABLED,
    ] as const

    const saved: Partial<Record<string, string | undefined>> = {}

    beforeEach(() => {
        for (const key of ENV_KEYS) {
            saved[key] = process.env[key]
        }
    })

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (saved[key] === undefined) {
                delete process.env[key]
            }
            else {
                process.env[key] = saved[key]!
            }
        }
    })

    it('resolves to the documented `false` disable value when the flag is off, with AUTHN on', async () => {
        process.env[AppSystemProp.API_RATE_LIMIT_SYNC_ENABLED] = 'false'
        process.env[AppSystemProp.API_RATE_LIMIT_AUTHN_ENABLED] = 'true'

        const { getSyncExecutionRateLimitOptions } = await import('@/app/core/security/rate-limit')
        // `false` is @fastify/rate-limit's explicit per-route disable; `undefined`
        // would be ambiguous with "not configured" and can inherit plugin defaults.
        expect(getSyncExecutionRateLimitOptions()).toBe(false)
    })

    it('resolves to real limits when the flag is on', async () => {
        process.env[AppSystemProp.API_RATE_LIMIT_SYNC_ENABLED] = 'true'

        const { getSyncExecutionRateLimitOptions } = await import('@/app/core/security/rate-limit')
        const options = getSyncExecutionRateLimitOptions()

        expect(options).not.toBe(false)
        expect(typeof options).toBe('object')
        expect(Number.isFinite((options as { max: number }).max)).toBe(true)
        expect((options as { max: number }).max).toBeGreaterThan(0)
        expect((options as { timeWindow: string }).timeWindow).toBeTruthy()
    })

    it('reads the flag at call time, so a later flip is honoured', async () => {
        const { getSyncExecutionRateLimitOptions } = await import('@/app/core/security/rate-limit')

        process.env[AppSystemProp.API_RATE_LIMIT_SYNC_ENABLED] = 'true'
        expect(getSyncExecutionRateLimitOptions()).not.toBe(false)

        process.env[AppSystemProp.API_RATE_LIMIT_SYNC_ENABLED] = 'false'
        expect(getSyncExecutionRateLimitOptions()).toBe(false)
    })

    it('never yields NaN for max, even with a garbage override', async () => {
        const { getSyncExecutionRateLimitOptions } = await import('@/app/core/security/rate-limit')
        const key = AppSystemProp.API_RATE_LIMIT_SYNC_MAX
        const previous = process.env[key]
        process.env[AppSystemProp.API_RATE_LIMIT_SYNC_ENABLED] = 'true'
        process.env[key] = 'not-a-number'

        try {
            // getNumberOrThrow is NaN-guarded and fails fast, so a bad value must
            // surface as a thrown error rather than a silently unlimited/NaN tier.
            expect(() => getSyncExecutionRateLimitOptions()).toThrow()
        }
        finally {
            if (previous === undefined) {
                delete process.env[key]
            }
            else {
                process.env[key] = previous
            }
        }
    })
})
