import RateLimitPlugin, { RateLimitOptions } from '@fastify/rate-limit'
import FastifyPlugin from 'fastify-plugin'
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { redisConnections } from '../../database/redis-connections'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'

const API_RATE_LIMIT_AUTHN_ENABLED = system.getBoolean(
    AppSystemProp.API_RATE_LIMIT_AUTHN_ENABLED,
)

const API_RATE_LIMIT_SYNC_ENABLED = system.getBoolean(
    AppSystemProp.API_RATE_LIMIT_SYNC_ENABLED,
)

export const rateLimitModule: FastifyPluginAsyncZod = FastifyPlugin(
    async (app) => {
        if (API_RATE_LIMIT_AUTHN_ENABLED || API_RATE_LIMIT_SYNC_ENABLED) {
            await app.register(RateLimitPlugin, {
                global: false,
                // Value-level fallback: extractClientRealIp only falls back to
                // request.ip when the header *name* is unset. Without it, every
                // client that omits the header (bare self-hosted, ALB-style
                // proxies) collapsed into a single shared bucket.
                keyGenerator: (req) => {
                    const headerName = system.get(AppSystemProp.CLIENT_REAL_IP_HEADER)
                    const fromHeader = headerName !== undefined
                        ? req.headers[headerName.toLowerCase()]
                        : undefined
                    const value = Array.isArray(fromHeader) ? fromHeader[0] : fromHeader
                    return value ?? req.ip
                },
                redis: await redisConnections.create(),
            })
        }
    },
)

// Tighter, IP-scoped tier for the routes an attacker would actually script against
// (sign-up, sign-in, password-reset request/confirm) — lower than the general AUTHN
// tier above, which also covers the already-authenticated switch-platform route.
// Shared across authentication.controller.ts, otp-controller.ts, and
// enterprise-local-authn-controller.ts so the limit is defined once. Registering
// this `config.rateLimit` on a route has no effect when the plugin above isn't
// registered (AP_API_RATE_LIMIT_AUTHN_ENABLED=false), same as the general tier.
export const authAbuseRateLimitOptions: RateLimitOptions = {
    max: system.getNumberOrThrow(AppSystemProp.API_RATE_LIMIT_AUTHN_ABUSE_MAX),
    timeWindow: system.getOrThrow(AppSystemProp.API_RATE_LIMIT_AUTHN_ABUSE_WINDOW),
}

// IP-scoped tier for routes that synchronously run piece code or fan out to
// upstream providers inside the API process — POST /v1/execute, executions
// list, knowledge-search, and the AI-provider routes. Evaluated to `undefined`
// (inert) unless AP_API_RATE_LIMIT_SYNC_ENABLED is on, so this tier is
// independently disableable even while the AUTHN tier keeps the shared plugin
// instance registered.
export const syncExecutionRateLimitOptions: RateLimitOptions | undefined = API_RATE_LIMIT_SYNC_ENABLED
    ? {
        max: system.getNumberOrThrow(AppSystemProp.API_RATE_LIMIT_SYNC_MAX),
        timeWindow: system.getOrThrow(AppSystemProp.API_RATE_LIMIT_SYNC_WINDOW),
    }
    : undefined
