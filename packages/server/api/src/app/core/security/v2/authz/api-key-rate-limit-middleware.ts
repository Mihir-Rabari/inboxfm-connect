import { ActivepiecesError, ErrorCode } from '@inboxfm-connect/core-utils'
import { PrincipalType } from '@inboxfm-connect/shared'
import { FastifyBaseLogger, FastifyRequest } from 'fastify'
import { redisConnections } from '../../../../database/redis-connections'
import { system } from '../../../../helper/system/system'
import { AppSystemProp } from '../../../../helper/system/system-props'

// Registered as a global preHandler hook (see app.ts), right after
// projectRateLimitMiddleware — same disabled-by-default, single-Map-lookup shape, so
// this costs nothing on the request path until a platform admin opts in. Distinct from
// projectRateLimitMiddleware: that one buckets by projectId, so two different `sk-`/
// `cak-` keys hitting the same project (or the same IP) share its budget. This buckets
// by the api key's own row id — set as `principal.id` for both `sk-` and `cak-` keys in
// authenticate.ts — so one compromised or misbehaving key is capped independently of
// every other key, project, or IP sharing the platform.
export const apiKeyRateLimitMiddleware = async (request: FastifyRequest): Promise<void> => {
    if (!(system.getBoolean(AppSystemProp.API_KEY_RATE_LIMITER_ENABLED) ?? false)) {
        return
    }
    if (request.principal?.type !== PrincipalType.SERVICE) {
        return
    }
    await assertApiKeyWithinRateLimit({ apiKeyId: request.principal.id, log: request.log })
}

// Same fixed-window-counter trade-offs as project-rate-limit-middleware.ts: INCR is
// atomic, EXPIRE is only set on the window's first request, so a window can rarely run
// very slightly long — acceptable for a rate limit, and needs no infra beyond the
// ioredis connection already used for BullMQ/distributedLock.
async function assertApiKeyWithinRateLimit({ apiKeyId, log }: { apiKeyId: string, log: FastifyBaseLogger }): Promise<void> {
    const maxRequests = system.getNumber(AppSystemProp.API_KEY_RATE_LIMITER_MAX_REQUESTS) ?? DEFAULT_MAX_REQUESTS
    const windowSeconds = system.getNumber(AppSystemProp.API_KEY_RATE_LIMITER_WINDOW_SECONDS) ?? DEFAULT_WINDOW_SECONDS

    const redis = await redisConnections.useExisting()
    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds)
    const key = `${API_KEY_RATE_LIMIT_KEY_PREFIX}:${apiKeyId}:${windowStart}`
    const requestCount = await redis.incr(key)
    if (requestCount === 1) {
        await redis.expire(key, windowSeconds)
    }
    if (requestCount <= maxRequests) {
        return
    }
    log.warn({ apiKey: { id: apiKeyId, action: 'rate-limited' }, requestCount, limit: maxRequests }, 'API key exceeded rate limit')
    throw new ActivepiecesError({
        code: ErrorCode.API_KEY_RATE_LIMIT_EXCEEDED,
        params: {
            apiKeyId,
            limit: maxRequests,
            windowSeconds,
        },
    })
}

const API_KEY_RATE_LIMIT_KEY_PREFIX = 'api-key-rate-limit'
const DEFAULT_MAX_REQUESTS = 120
const DEFAULT_WINDOW_SECONDS = 60
