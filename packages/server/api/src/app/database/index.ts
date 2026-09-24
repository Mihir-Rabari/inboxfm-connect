import { system } from '../helper/system/system'
import { AppSystemProp } from '../helper/system/system-props'
import { databaseConnection } from './database-connection'
import { DatabaseType } from './database-type'
import { postgresPoolMetrics } from './postgres-pool-metrics'
import { databaseSeeds } from './seeds'

export async function initializeDatabase({ runMigrations }: { runMigrations: boolean }): Promise<void> {
    const dataSource = databaseConnection()
    await dataSource.initialize()
    if (runMigrations) {
        await dataSource.runMigrations()
    }
    await databaseSeeds.run()

    const isPostgres = system.get(AppSystemProp.DB_TYPE) === DatabaseType.POSTGRES
    if (system.isApp() && isPostgres) {
        postgresPoolMetrics.start({ dataSource, log: system.globalLogger() })
    }
}