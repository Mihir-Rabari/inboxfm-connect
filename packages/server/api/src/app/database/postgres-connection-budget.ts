import { isNil } from '@inboxfm-connect/core-utils'
import { FastifyBaseLogger } from 'fastify'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { DatabaseType } from './database-type'

/**
 * Only replicas running the APP role (CONTAINER_TYPE `APP` or `WORKER_AND_APP`) ever open a
 * Postgres pool — `setupApp()` (and therefore every DB-touching module) is only registered when
 * `system.isApp()` is true (see `server.ts`). A pure `WORKER` replica talks to the app tier over
 * HTTP callbacks and never calls `databaseConnection().initialize()`, so it is excluded from the
 * connection budget entirely; only app-role replica count matters here.
 */
export function computePostgresConnectionBudget({ maxConnections }: { maxConnections: number }): number {
    const reservable = maxConnections - POSTGRES_SUPERUSER_RESERVED_CONNECTIONS - MIGRATION_LOCK_HOLDER_RESERVE
    return Math.max(0, Math.floor(reservable * (1 - OPERATIONAL_HEADROOM_RATIO)))
}

export function computeRequiredPostgresConnections({ poolSize, expectedAppReplicas }: { poolSize: number, expectedAppReplicas: number }): number {
    return poolSize * expectedAppReplicas
}

/**
 * Zero-setup by default: the check only activates once an operator declares `AP_POSTGRES_MAX_CONNECTIONS`
 * (the Postgres server's own `max_connections`). Self-hosters who never set it keep booting exactly as
 * before — there is no way for this function to silently start failing an existing deployment.
 *
 * When declared, `AP_POSTGRES_EXPECTED_APP_REPLICAS` defaults to `1` (the common single-replica /
 * docker-compose self-host shape), so setting only `AP_POSTGRES_MAX_CONNECTIONS` still produces a
 * meaningful, almost-always-passing check rather than requiring every env var up front.
 */
export function assertPostgresConnectionBudget({ log }: { log: FastifyBaseLogger }): void {
    const isPostgres = system.get(AppSystemProp.DB_TYPE) === DatabaseType.POSTGRES
    const maxConnections = system.getNumber(AppSystemProp.POSTGRES_MAX_CONNECTIONS)
    if (!isPostgres || isNil(maxConnections)) {
        return
    }

    const expectedAppReplicas = system.getNumber(AppSystemProp.POSTGRES_EXPECTED_APP_REPLICAS) ?? 1
    const poolSize = system.getNumber(AppSystemProp.POSTGRES_POOL_SIZE) ?? DEFAULT_PG_POOL_SIZE
    const budget = computePostgresConnectionBudget({ maxConnections })
    const requiredConnections = computeRequiredPostgresConnections({ poolSize, expectedAppReplicas })

    log.info({
        pool: {
            maxConnections,
            budget,
            poolSize,
            expectedAppReplicas,
            requiredConnections,
        },
    }, '[assertPostgresConnectionBudget] Computed Postgres connection budget')

    if (requiredConnections > budget) {
        throw new Error(JSON.stringify({
            message: `Configured Postgres pool size (AP_POSTGRES_POOL_SIZE=${poolSize}) x expected app replicas (AP_POSTGRES_EXPECTED_APP_REPLICAS=${expectedAppReplicas}) = ${requiredConnections} connections, which exceeds the declared connection budget of ${budget} (from AP_POSTGRES_MAX_CONNECTIONS=${maxConnections}, minus ${POSTGRES_SUPERUSER_RESERVED_CONNECTIONS} reserved superuser + ${MIGRATION_LOCK_HOLDER_RESERVE} migration connections, minus ${OPERATIONAL_HEADROOM_RATIO * 100}% operational headroom). Lower AP_POSTGRES_POOL_SIZE, reduce the app replica count, or raise Postgres max_connections and AP_POSTGRES_MAX_CONNECTIONS to match.`,
            docUrl: 'https://www.activepieces.com/docs/install/configure-operate/postgres-connection-budget',
        }))
    }

    if (requiredConnections > budget * WARN_THRESHOLD_RATIO) {
        log.warn({
            pool: {
                maxConnections,
                budget,
                poolSize,
                expectedAppReplicas,
                requiredConnections,
            },
        }, '[assertPostgresConnectionBudget] Approaching the declared Postgres connection budget — scaling out further will exceed it')
    }
}

const DEFAULT_PG_POOL_SIZE = 10
const POSTGRES_SUPERUSER_RESERVED_CONNECTIONS = 3
const MIGRATION_LOCK_HOLDER_RESERVE = 1
const OPERATIONAL_HEADROOM_RATIO = 0.2
const WARN_THRESHOLD_RATIO = 0.8
