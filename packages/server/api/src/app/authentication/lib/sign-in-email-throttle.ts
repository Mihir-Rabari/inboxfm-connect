import { ActivepiecesError, ErrorCode, isNil } from '@inboxfm-connect/core-utils'
import { FastifyBaseLogger } from 'fastify'
import { redisConnections } from '../../database/redis-connections'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'

// Called explicitly from the /sign-in route handler (see authentication.controller.ts),
// not as a global hook — the per-IP AUTHN rate-limit tier already covers every request,
// but it can't stop credential stuffing spread across many IPs/a botnet against ONE
// account. This adds a second, per-email axis: a fixed-window failure counter in Redis,
// same trade-offs as project-rate-limit-middleware.ts (INCR/EXPIRE is atomic-enough for
// a rate limit; a window can rarely run very slightly long, which is fine here). Needs
// zero extra infra beyond the ioredis connection already used for BullMQ/distributedLock.
export const signInEmailThrottle = (log: FastifyBaseLogger) => ({
    async assertNotThrottled({ email }: EmailParams): Promise<void> {
        if (!isEnabled()) {
            return
        }
        const redis = await redisConnections.useExisting()
        const currentCount = await redis.get(buildKey(email))
        const maxAttempts = getMaxAttempts()
        if (!isNil(currentCount) && Number.parseInt(currentCount, 10) >= maxAttempts) {
            const windowSeconds = getWindowSeconds()
            log.warn({ maxAttempts, windowSeconds }, 'Sign-in blocked: too many failed attempts for this email')
            throw new ActivepiecesError({
                code: ErrorCode.SIGN_IN_ATTEMPTS_EXCEEDED,
                params: {
                    email: normalizeEmail(email),
                    limit: maxAttempts,
                    windowSeconds,
                },
            })
        }
    },

    async recordFailedAttempt({ email }: EmailParams): Promise<void> {
        if (!isEnabled()) {
            return
        }
        const redis = await redisConnections.useExisting()
        const key = buildKey(email)
        const attempts = await redis.incr(key)
        if (attempts === 1) {
            await redis.expire(key, getWindowSeconds())
        }
    },

    async clearAttempts({ email }: EmailParams): Promise<void> {
        if (!isEnabled()) {
            return
        }
        const redis = await redisConnections.useExisting()
        await redis.del(buildKey(email))
    },
})

function isEnabled(): boolean {
    return system.getBoolean(AppSystemProp.API_SIGN_IN_EMAIL_THROTTLE_ENABLED) ?? true
}

function getMaxAttempts(): number {
    return system.getNumber(AppSystemProp.API_SIGN_IN_EMAIL_THROTTLE_MAX_ATTEMPTS) ?? DEFAULT_MAX_ATTEMPTS
}

function getWindowSeconds(): number {
    return system.getNumber(AppSystemProp.API_SIGN_IN_EMAIL_THROTTLE_WINDOW_SECONDS) ?? DEFAULT_WINDOW_SECONDS
}

function normalizeEmail(email: string): string {
    return email.toLowerCase().trim()
}

function buildKey(email: string): string {
    return `${SIGN_IN_EMAIL_THROTTLE_KEY_PREFIX}:${normalizeEmail(email)}`
}

const SIGN_IN_EMAIL_THROTTLE_KEY_PREFIX = 'sign-in-email-throttle'

// 5 failed attempts per 15-minute window per email address (mirrors the defaults in
// system.ts / AppSystemProp.API_SIGN_IN_EMAIL_THROTTLE_*, which platform admins can
// override). A standard OWASP-style lockout threshold: a legitimate user mistyping
// their password a couple of times is unaffected, and a successful sign-in clears the
// counter immediately (see `clearAttempts`), so this only ever blocks a sustained run
// of failures against a single account.
const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_WINDOW_SECONDS = 15 * 60

type EmailParams = {
    email: string
}
