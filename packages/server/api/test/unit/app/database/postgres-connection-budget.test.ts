import { afterEach, describe, expect, it } from 'vitest'
import { assertPostgresConnectionBudget, computePostgresConnectionBudget, computeRequiredPostgresConnections } from '../../../../src/app/database/postgres-connection-budget'
import { system } from '../../../../src/app/helper/system/system'

const log = system.globalLogger()

function clearBudgetEnvVars(): void {
    delete process.env.AP_POSTGRES_MAX_CONNECTIONS
    delete process.env.AP_POSTGRES_EXPECTED_APP_REPLICAS
    delete process.env.AP_POSTGRES_POOL_SIZE
    delete process.env.AP_DB_TYPE
}

describe('computePostgresConnectionBudget', () => {
    it('reserves superuser + migration connections and applies operational headroom', () => {
        // 100 max - 3 superuser - 1 migration = 96 reservable; 96 * 0.8 headroom-adjusted = 76.8 -> floor 76
        expect(computePostgresConnectionBudget({ maxConnections: 100 })).toBe(76)
    })

    it('never returns a negative budget for a very small max_connections', () => {
        expect(computePostgresConnectionBudget({ maxConnections: 2 })).toBe(0)
    })
})

describe('computeRequiredPostgresConnections', () => {
    it('multiplies pool size by expected app replicas', () => {
        expect(computeRequiredPostgresConnections({ poolSize: 10, expectedAppReplicas: 8 })).toBe(80)
    })
})

describe('assertPostgresConnectionBudget (zero-setup self-hosting defaults)', () => {
    afterEach(() => {
        clearBudgetEnvVars()
    })

    it('is a no-op when AP_POSTGRES_MAX_CONNECTIONS is unset — the zero-config self-hosted default', () => {
        clearBudgetEnvVars()
        process.env.AP_POSTGRES_POOL_SIZE = '1000'
        process.env.AP_POSTGRES_EXPECTED_APP_REPLICAS = '1000'

        expect(() => assertPostgresConnectionBudget({ log })).not.toThrow()
    })

    it('is a no-op for the embedded PGlite database even if AP_POSTGRES_MAX_CONNECTIONS is set', () => {
        clearBudgetEnvVars()
        process.env.AP_DB_TYPE = 'PGLITE'
        process.env.AP_POSTGRES_MAX_CONNECTIONS = '10'
        process.env.AP_POSTGRES_POOL_SIZE = '1000'
        process.env.AP_POSTGRES_EXPECTED_APP_REPLICAS = '1000'

        expect(() => assertPostgresConnectionBudget({ log })).not.toThrow()
    })

    it('defaults expected app replicas to 1 when only AP_POSTGRES_MAX_CONNECTIONS is declared', () => {
        clearBudgetEnvVars()
        process.env.AP_POSTGRES_MAX_CONNECTIONS = '100'
        process.env.AP_POSTGRES_POOL_SIZE = '10'

        // budget(100) = 76, required = 10 * 1 replica = 10 — well within budget
        expect(() => assertPostgresConnectionBudget({ log })).not.toThrow()
    })

    it('throws a fail-fast, actionable error once pool size x expected replicas exceeds the declared budget', () => {
        clearBudgetEnvVars()
        process.env.AP_POSTGRES_MAX_CONNECTIONS = '100'
        process.env.AP_POSTGRES_POOL_SIZE = '10'
        process.env.AP_POSTGRES_EXPECTED_APP_REPLICAS = '20'

        // budget(100) = 76, required = 10 * 20 = 200 — exceeds budget
        expect(() => assertPostgresConnectionBudget({ log })).toThrow(/exceeds the declared connection budget/)
    })

    it('passes when comfortably within the declared budget for a realistic fleet size', () => {
        clearBudgetEnvVars()
        process.env.AP_POSTGRES_MAX_CONNECTIONS = '100'
        process.env.AP_POSTGRES_POOL_SIZE = '5'
        process.env.AP_POSTGRES_EXPECTED_APP_REPLICAS = '8'

        // budget(100) = 76, required = 5 * 8 = 40 — within budget
        expect(() => assertPostgresConnectionBudget({ log })).not.toThrow()
    })
})
