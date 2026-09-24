import { ActivepiecesError, ErrorCode, isNil, ProjectId } from '@inboxfm-connect/core-utils'
import { FastifyBaseLogger, FastifyRequest } from 'fastify'
import { redisConnections } from '../../../../database/redis-connections'
import { system } from '../../../../helper/system/system'
import { AppSystemProp } from '../../../../helper/system/system-props'
import { AuthorizationType, RouteKind } from '../../authorization/common'
import { convertToSecurityAccessRequest } from './authorization-middleware'

// Registered as a global preHandler hook (see app.ts), so it runs on every request.
// The flag check is a single Map lookup (system.getBoolean), so a disabled project
// rate limiter — the default — costs effectively nothing on the request path: this
// function returns immediately, byte-for-byte the same as if the hook did not exist.
export const projectRateLimitMiddleware = async (request: FastifyRequest): Promise<void> => {
    if (!(system.getBoolean(AppSystemProp.PROJECT_RATE_LIMITER_ENABLED) ?? false)) {
        return
    }
    const security = await convertToSecurityAccessRequest(request)
    if (security.kind !== RouteKind.AUTHENTICATED || security.authorization.type !== AuthorizationType.PROJECT) {
        return
    }
    const projectId = security.authorization.projectId
    if (isNil(projectId)) {
        return
    }
    await assertProjectWithinRateLimit({ projectId, log: request.log })
}

// Fixed-window counter in Redis, scoped by projectId per .claude/rules/data-isolation.md.
// A different project's window key is independent, so one project being throttled
// never affects another. INCR is atomic; EXPIRE is only set on the first request of
// a window, which can in rare races leave a window very slightly longer than
// configured — acceptable for a rate limit and far simpler than a Lua-scripted
// sliding window, with no extra infra beyond the ioredis connection already used
// for BullMQ/distributedLock (see redis-connections.ts), so this needs zero setup.
async function assertProjectWithinRateLimit({ projectId, log }: { projectId: ProjectId, log: FastifyBaseLogger }): Promise<void> {
    const maxRequests = system.getNumber(AppSystemProp.PROJECT_RATE_LIMITER_MAX_REQUESTS) ?? DEFAULT_MAX_REQUESTS
    const windowSeconds = system.getNumber(AppSystemProp.PROJECT_RATE_LIMITER_WINDOW_SECONDS) ?? DEFAULT_WINDOW_SECONDS

    const redis = await redisConnections.useExisting()
    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds)
    const key = `${PROJECT_RATE_LIMIT_KEY_PREFIX}:${projectId}:${windowStart}`
    const requestCount = await redis.incr(key)
    if (requestCount === 1) {
        await redis.expire(key, windowSeconds)
    }
    if (requestCount <= maxRequests) {
        return
    }
    log.warn({ projectId, requestCount, limit: maxRequests }, 'Project exceeded API rate limit')
    throw new ActivepiecesError({
        code: ErrorCode.PROJECT_RATE_LIMIT_EXCEEDED,
        params: {
            projectId,
            limit: maxRequests,
            windowSeconds,
        },
    })
}

const PROJECT_RATE_LIMIT_KEY_PREFIX = 'project-rate-limit'

// 300 requests/minute per project comfortably covers a busy flow-builder session
// (editor autosave + polling) and normal webhook/API traffic for a single project,
// while still capping a runaway script or misbehaving integration. Mirrors the
// AppSystemProp.PROJECT_RATE_LIMITER_MAX_REQUESTS / _WINDOW_SECONDS defaults in
// helper/system/system.ts, which platform admins can override.
const DEFAULT_MAX_REQUESTS = 300
const DEFAULT_WINDOW_SECONDS = 60
