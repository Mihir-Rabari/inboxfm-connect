import { ActivepiecesError, ErrorCode, isNil, ProjectId } from '@inboxfm-connect/core-utils'
import { ApLogger } from '@inboxfm-connect/server-utils'
import { Redis } from 'ioredis'
import { redisConnections } from '../../database/redis-connections'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { projectExecutionConcurrencyHooks } from './project-execution-concurrency-hooks'

// Guards the single chokepoint every project-attributable execution passes through
// today: `userInteractionWatcher.submitAndWaitForResponse` runs synchronously
// in-process against a fixed-size, platform-wide sandbox pool (see
// `createSandboxRuntime({ concurrency: 10 })`) — there is no queue to bound depth
// on, so "concurrent executions" here means "requests currently inside that
// synchronous call for this project". One Redis INCR per acquire is the atomic
// admission decision (a unique post-increment value per caller), so no Lua script
// is needed; `release` mirrors it with DECR. Disabled by default (same shape as
// `AppSystemProp.PROJECT_RATE_LIMITER_ENABLED`), so an existing self-hosted
// deployment never starts rejecting executions it didn't reject before.
export const projectExecutionConcurrencyGuard = {
    async acquire({ projectId, log }: AcquireParams): Promise<ExecutionSlot> {
        // An explicit per-project pool assignment (ConcurrencyPoolEntity, settable via
        // platform-project-service.ts#update / managed-authn-service.ts today but never
        // enforced anywhere) always applies, independent of the flag below — an admin
        // who assigned one already opted in. The flag below only gates the platform-wide
        // fallback default, per the zero-setup self-hosting rule.
        const poolLimit = await projectExecutionConcurrencyHooks.get(system.globalLogger()).resolveLimit(projectId)
        const limiterEnabled = system.getBoolean(AppSystemProp.PROJECT_EXECUTION_CONCURRENCY_LIMITER_ENABLED) ?? false
        if (isNil(poolLimit) && !limiterEnabled) {
            return { release: async (): Promise<void> => {} }
        }

        const limit = poolLimit ?? system.getNumber(AppSystemProp.PROJECT_EXECUTION_CONCURRENCY_LIMIT) ?? DEFAULT_LIMIT
        const slotTtlSeconds = system.getNumber(AppSystemProp.PROJECT_EXECUTION_CONCURRENCY_SLOT_TTL_SECONDS) ?? DEFAULT_SLOT_TTL_SECONDS
        const redis = await redisConnections.useExisting()
        const key = executionConcurrencyKey(projectId)

        const activeCount = await redis.incr(key)
        // Refreshed on every acquire (unlike the fixed-window rate limiter's
        // first-request-only EXPIRE) so the TTL keeps sliding forward while the
        // project keeps executing. It only fires as a backstop if a process dies
        // mid-execution without releasing its slot.
        await redis.expire(key, slotTtlSeconds)

        if (activeCount > limit) {
            await releaseSlot({ redis, key })
            log.warn({
                project: { id: projectId },
                execution: { activeCount: activeCount - 1, limit },
            }, 'Project exceeded execution concurrency limit')
            throw new ActivepiecesError({
                code: ErrorCode.PROJECT_EXECUTION_CONCURRENCY_LIMIT_EXCEEDED,
                params: {
                    projectId,
                    limit,
                    activeCount: activeCount - 1,
                    retryAfterSeconds: RETRY_AFTER_SECONDS,
                },
            })
        }

        if (activeCount === limit) {
            log.info({
                project: { id: projectId },
                execution: { activeCount, limit },
            }, 'Project reached its execution concurrency limit')
        }

        let released = false
        return {
            release: async (): Promise<void> => {
                if (released) {
                    return
                }
                released = true
                await releaseSlot({ redis, key })
            },
        }
    },
}

async function releaseSlot({ redis, key }: { redis: Redis, key: string }): Promise<void> {
    const remaining = await redis.decr(key)
    // <= 0 covers both the normal empty-pool case and a key that expired and was
    // silently recreated by a stray DECR mid-flight (see slotTtlSeconds comment
    // above) — either way, deleting it resets the counter to a clean baseline
    // instead of leaving a negative value with no TTL.
    if (remaining <= 0) {
        await redis.del(key)
    }
}

function executionConcurrencyKey(projectId: ProjectId): string {
    return `${PROJECT_EXECUTION_CONCURRENCY_KEY_PREFIX}:${projectId}`
}

const PROJECT_EXECUTION_CONCURRENCY_KEY_PREFIX = 'project-execution-concurrency'

// Comfortably covers a single busy project's webhook bursts/schedules on a typical
// self-hosted deployment while stopping it from occupying the entire shared
// 10-slot sandbox pool. Mirrors AppSystemProp.PROJECT_EXECUTION_CONCURRENCY_LIMIT
// in helper/system/system.ts, which platform admins can override.
const DEFAULT_LIMIT = 5
const DEFAULT_SLOT_TTL_SECONDS = 900

// There is no queue position to compute a real wait from (see module comment), so
// this is a fixed, documented backoff hint: safe to retry once any other in-flight
// execution for the project completes, which — given typical execution
// durations — is very likely to have happened within a few seconds.
const RETRY_AFTER_SECONDS = 5

type AcquireParams = {
    projectId: ProjectId
    log: ApLogger
}

export type ExecutionSlot = {
    release: () => Promise<void>
}
