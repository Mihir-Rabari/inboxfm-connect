import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { computeTokenRefreshAt, isCustomAuthTokenStale } from '../../../../src/app/app-connection/app-connection-service/app-connection.handler'

const BUFFER_SECONDS = 15 * 60

/**
 * The clock is frozen for the whole file. Both helpers read the current time
 * internally, so comparing their output against a `NOW` sampled separately was an
 * off-by-one whenever the wall clock crossed a second boundary between the two reads
 * (`expected 1787847710 to be 1787847709`). A fixed instant makes the arithmetic
 * exact instead of merely usually-exact.
 */
const FROZEN_NOW_MS = Date.UTC(2026, 0, 15, 12, 0, 0)
const NOW = Math.floor(FROZEN_NOW_MS / 1000)

beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FROZEN_NOW_MS)
})

afterAll(() => {
    vi.useRealTimers()
})

describe('isCustomAuthTokenStale', () => {
    describe('when access_token is missing', () => {
        it('returns true (piece never refreshed yet)', () => {
            expect(isCustomAuthTokenStale({})).toBe(true)
            expect(isCustomAuthTokenStale({ access_token: undefined })).toBe(true)
        })
    })

    describe('when access_token is present', () => {
        it('returns false when token_refresh_at is missing (never expires)', () => {
            expect(isCustomAuthTokenStale({ access_token: 'tok' })).toBe(false)
            expect(isCustomAuthTokenStale({ access_token: 'tok', token_refresh_at: undefined })).toBe(false)
        })

        it('returns true when the refresh instant has passed', () => {
            expect(isCustomAuthTokenStale({ access_token: 'tok', token_refresh_at: NOW - 60 })).toBe(true)
        })

        it('returns true exactly at the refresh instant', () => {
            expect(isCustomAuthTokenStale({ access_token: 'tok', token_refresh_at: NOW })).toBe(true)
        })

        it('returns false when the refresh instant is still in the future', () => {
            expect(isCustomAuthTokenStale({ access_token: 'tok', token_refresh_at: NOW + 60 })).toBe(false)
        })
    })
})

describe('computeTokenRefreshAt', () => {
    it('returns undefined (never refresh) when expiresIn is zero or negative', () => {
        expect(computeTokenRefreshAt(0)).toBeUndefined()
        expect(computeTokenRefreshAt(-1)).toBeUndefined()
    })

    it('applies the full 15-minute buffer for long-lived tokens', () => {
        const expiresIn = 3300
        const refreshAt = computeTokenRefreshAt(expiresIn)
        expect(refreshAt).toBe(NOW + expiresIn - BUFFER_SECONDS)
    })

    it('clamps the buffer to half the lifetime for short-lived tokens', () => {
        // A 10-minute token must not be refreshed before its 5-minute half-life,
        // otherwise the 15-minute buffer would make it stale the instant it is minted.
        const expiresIn = 600
        const refreshAt = computeTokenRefreshAt(expiresIn)
        expect(refreshAt).toBe(NOW + expiresIn - Math.floor(expiresIn / 2))
        expect(refreshAt).toBeGreaterThan(NOW)
    })

    it('keeps a short-lived token fresh immediately after minting', () => {
        const expiresIn = 600
        const refreshAt = computeTokenRefreshAt(expiresIn)!
        expect(isCustomAuthTokenStale({ access_token: 'tok', token_refresh_at: refreshAt })).toBe(false)
    })
})
