import { apVersionUtil, systemUsage } from '@inboxfm-connect/server-utils'
import { GetSystemHealthChecksResponse } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { databaseConnection } from '../database/database-connection'
import { system } from '../helper/system/system'

let workerHealthStatus = true

export const healthStatusService = (log: FastifyBaseLogger) => ({
    markWorkerHealthy: async (): Promise<void> => {
        workerHealthStatus = true
    },
    checkDatabaseHealth: async (): Promise<boolean> => {
        try {
            const connection = databaseConnection()
            if (!connection.isInitialized) {
                return false
            }
            await connection.query('SELECT 1')
            return true
        } 
        catch (error) {
            log.warn({ error }, 'Database health check failed')
            return false
        }
    },
    isHealthy: async (): Promise<boolean> => {
        let workerHealthy = true
        let databaseHealthy = true

        if (system.isWorker()) {
            workerHealthy = workerHealthStatus
        }
        if (system.isApp()) {
            databaseHealthy = await healthStatusService(log).checkDatabaseHealth()
        }
        return  workerHealthy && databaseHealthy
    },
    getSystemHealthChecks: async (platformId: string): Promise<GetSystemHealthChecksResponse> => {
        const [databaseHealthy, latestVersion] = await Promise.all([
            healthStatusService(log).checkDatabaseHealth(),
            apVersionUtil.getLatestRelease(),
        ])

        return {
            latestVersion,
            appCpu: await systemUsage.getCpuCores() >= APP_MIN_CPU_CORES,
            appRam: (await systemUsage.getContainerMemoryUsage()).totalRamInBytes >= gigaBytes(APP_MIN_RAM_GB),
            disk: (await systemUsage.getDiskInfo()).total >= gigaBytes(APP_MIN_DISK_GB),
            workerCpu: null,
            workerRam: null,
            database: databaseHealthy,
        }
    },
})

const gigaBytes = (value: number) => value * 1024 * 1024 * 1024

const APP_MIN_CPU_CORES = 1
const APP_MIN_RAM_GB = 2
const APP_MIN_DISK_GB = 30
const WORKER_MIN_CPU_CORES = 0.5
const WORKER_MIN_RAM_GB = 1