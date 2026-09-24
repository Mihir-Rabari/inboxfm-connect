import { isNil } from '@inboxfm-connect/core-utils'
import { tryCatch } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { DataSource } from 'typeorm'
import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'

/**
 * Snapshots real server-side connection counts from `pg_stat_activity` rather than reaching into
 * the driver's internal `pg.Pool` (TypeORM's `PostgresDriver.master` is untyped/unsupported for
 * external use). This also reports the true fleet-wide picture — every app-role replica's
 * connections against the server's actual `max_connections` — not just this process's local pool.
 */
export const postgresPoolMetrics = {
    start({ dataSource, log }: { dataSource: DataSource, log: FastifyBaseLogger }): void {
        if (!isNil(snapshotTimer)) {
            return
        }
        snapshotTimer = setInterval(() => {
            void logConnectionSnapshot({ dataSource, log })
        }, SNAPSHOT_INTERVAL_MS)
        snapshotTimer.unref()
    },
    stop(): void {
        if (!isNil(snapshotTimer)) {
            clearInterval(snapshotTimer)
            snapshotTimer = undefined
        }
    },
}

async function logConnectionSnapshot({ dataSource, log }: { dataSource: DataSource, log: FastifyBaseLogger }): Promise<void> {
    const expectedAppReplicas = system.getNumber(AppSystemProp.POSTGRES_EXPECTED_APP_REPLICAS) ?? 1
    const declaredMaxConnections = system.getNumber(AppSystemProp.POSTGRES_MAX_CONNECTIONS)

    const { data: rows, error } = await tryCatch(() => dataSource.query<PgStatActivityRow[]>(SNAPSHOT_QUERY))

    if (error) {
        log.error({
            pool: {
                poolError: error,
            },
        }, '[postgresPoolMetrics] Failed to collect Postgres connection snapshot — the server may be too saturated to answer a lightweight query')
        return
    }

    const [row] = rows
    if (isNil(row)) {
        return
    }

    const utilizationRatio = row.serverMaxConnections > 0 ? row.total / row.serverMaxConnections : 0
    const level = utilizationRatio >= SATURATION_WARN_RATIO ? 'warn' : 'debug'
    log[level]({
        pool: {
            totalCount: row.total,
            activeCount: row.active,
            idleCount: row.idle,
            serverMaxConnections: row.serverMaxConnections,
            expectedAppReplicas,
            declaredMaxConnections,
            utilizationRatio,
        },
    }, level === 'warn'
        ? '[postgresPoolMetrics] Postgres connections are approaching server max_connections — fleet may be near saturation'
        : '[postgresPoolMetrics] Postgres connection snapshot')
}

const SNAPSHOT_INTERVAL_MS = 60_000
const SATURATION_WARN_RATIO = 0.8
const SNAPSHOT_QUERY = `
    SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE state = 'active')::int AS active,
        count(*) FILTER (WHERE state = 'idle')::int AS idle,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS "serverMaxConnections"
    FROM pg_stat_activity
    WHERE datname = current_database()
`

let snapshotTimer: NodeJS.Timeout | undefined

type PgStatActivityRow = {
    total: number
    active: number
    idle: number
    serverMaxConnections: number
}
