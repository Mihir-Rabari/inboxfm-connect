import { DataSource } from 'typeorm'
import { system } from '../../../../src/app/helper/system/system'
import { AppSystemProp } from '../../../../src/app/helper/system/system-props'

/**
 * Simulates connection starvation on a real Postgres instance with a deliberately tiny pool
 * (poolSize: 2) and a short `connectTimeoutMS`, standing in for a fleet of app replicas that has
 * scaled past the database's connection budget. This is NOT a multi-replica GKE fleet test —
 * it exercises the same pool-exhaustion path (pg-pool's checkout queue) a real fleet would hit,
 * against a real Postgres, inside a single process.
 */
const SHORT_CONNECT_TIMEOUT_MS = 500

function buildUndersizedDataSource(): DataSource {
    return new DataSource({
        type: 'postgres',
        host: system.getOrThrow(AppSystemProp.POSTGRES_HOST),
        port: Number.parseInt(system.getOrThrow(AppSystemProp.POSTGRES_PORT), 10),
        username: system.getOrThrow(AppSystemProp.POSTGRES_USERNAME),
        password: system.getOrThrow(AppSystemProp.POSTGRES_PASSWORD),
        database: system.getOrThrow(AppSystemProp.POSTGRES_DATABASE),
        poolSize: 2,
        connectTimeoutMS: SHORT_CONNECT_TIMEOUT_MS,
        entities: [],
        synchronize: false,
    })
}

describe('Postgres connection saturation', () => {
    let dataSource: DataSource

    beforeAll(async () => {
        dataSource = buildUndersizedDataSource()
        await dataSource.initialize()
    })

    afterAll(async () => {
        await dataSource.destroy()
    })

    it('rejects with a bounded, actionable timeout once the pool is exhausted, instead of hanging forever', async () => {
        const holdSlots = [
            dataSource.query('SELECT pg_sleep(2)'),
            dataSource.query('SELECT pg_sleep(2)'),
        ]

        // Give both slow queries time to actually check out the pool's only two connections
        // before we try to acquire a third — otherwise this query could race them for a slot.
        await new Promise((resolve) => setTimeout(resolve, 100))

        const startedAt = Date.now()
        await expect(dataSource.query('SELECT 1')).rejects.toThrow(/timeout exceeded when trying to connect/)
        const elapsedMs = Date.now() - startedAt

        // Bounded well below the 2s pg_sleep held by the other two connections — proves the
        // rejection came from connectTimeoutMS, not from eventually waiting for a slot to free.
        expect(elapsedMs).toBeLessThan(1500)
        expect(elapsedMs).toBeGreaterThanOrEqual(SHORT_CONNECT_TIMEOUT_MS - 100)

        await Promise.all(holdSlots)
    })

    it('recovers once slots free up — starvation is transient, not a deadlock', async () => {
        const result = await dataSource.query<{ ok: number }[]>('SELECT 1 AS ok')
        expect(result[0].ok).toBe(1)
    })
})
