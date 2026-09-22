import { PlatformId } from '@inboxfm-connect/core-utils'
import { apDayjsDuration } from '@inboxfm-connect/server-utils'
import { FlowRunStatus, InternalErrorImpactItem, PlatformMetricsHealthDay, PlatformMetricsHealthHistory, PlatformMetricsLive, PlatformMetricsReport, PlatformMetricsStatusPoint, StuckJob } from '@inboxfm-connect/shared'
import dayjs from 'dayjs'
import { FastifyBaseLogger } from 'fastify'
import { distributedStore } from '../database/redis-connections'
import { projectService } from '../project/project-service'

type ReportWindow = {
    createdAfter: string
    createdBefore: string
}

function buildReportCacheKey(platformId: PlatformId, window: ReportWindow): string {
    return `${REPORT_CACHE_PREFIX}:${platformId}:${window.createdAfter}:${window.createdBefore}`
}

async function countsByStatus(_projectIds: string[], _window: ReportWindow): Promise<Map<FlowRunStatus, number>> {
    return new Map()
}

async function buildStatusTimeseries(_projectIds: string[], _window: ReportWindow): Promise<PlatformMetricsStatusPoint[]> {
    return []
}

async function buildInternalErrorImpact(_projectIds: string[], _window: ReportWindow): Promise<InternalErrorImpactItem[]> {
    return []
}

function previousWindow(window: ReportWindow): ReportWindow {
    const lengthMs = dayjs(window.createdBefore).diff(dayjs(window.createdAfter), 'millisecond')
    return {
        createdAfter: dayjs(window.createdAfter).subtract(lengthMs, 'millisecond').toISOString(),
        createdBefore: window.createdAfter,
    }
}

function summarize(counts: Map<FlowRunStatus, number>): { completed: number, successRate: number } {
    const succeeded = counts.get(FlowRunStatus.SUCCEEDED) ?? 0
    const failed = counts.get(FlowRunStatus.FAILED) ?? 0
    const completed = succeeded + failed
    const successRate = completed === 0 ? 0 : (succeeded / completed) * 100
    return { completed, successRate }
}

async function queueStatusCounts(_projectIds: string[], _window: ReportWindow): Promise<Map<FlowRunStatus, number>> {
    return new Map()
}

async function buildStuckJobs(_projectIds: string[], _window: ReportWindow): Promise<StuckJob[]> {
    return []
}

function buildEmptyHealthHistory(): PlatformMetricsHealthDay[] {
    return Array.from({ length: HEALTH_HISTORY_DAYS }, (_unused, index) => ({
        day: dayjs().startOf('day').subtract(HEALTH_HISTORY_DAYS - 1 - index, 'day').toISOString(),
        internalErrors: 0,
        affectedFlows: 0,
        stuckJobs: 0,
    }))
}

async function buildHealthHistory(_projectIds: string[]): Promise<PlatformMetricsHealthDay[]> {
    return buildEmptyHealthHistory()
}

export const healthMetricsService = (log: FastifyBaseLogger) => ({
    getRunMetrics: async (platformId: PlatformId, window: ReportWindow): Promise<PlatformMetricsReport> => {
        const cacheKey = buildReportCacheKey(platformId, window)
        const cached = await distributedStore.get<PlatformMetricsReport>(cacheKey)
        if (cached) {
            return cached
        }

        const nextRefreshAt = dayjs().add(REPORT_TTL_SECONDS, 'second').toISOString()
        const projectIds = await projectService(log).getProjectIdsByPlatform(platformId)
        if (projectIds.length === 0) {
            return { summary: { completed: 0, successRate: 0, previousCompleted: 0, previousSuccessRate: 0 }, statusTimeseries: [], internalErrors: [], nextRefreshAt }
        }

        const [currentCounts, previousCounts, statusTimeseries, internalErrors] = await Promise.all([
            countsByStatus(projectIds, window),
            countsByStatus(projectIds, previousWindow(window)),
            buildStatusTimeseries(projectIds, window),
            buildInternalErrorImpact(projectIds, window),
        ])

        const current = summarize(currentCounts)
        const previous = summarize(previousCounts)
        const value: PlatformMetricsReport = {
            summary: {
                completed: current.completed,
                successRate: current.successRate,
                previousCompleted: previous.completed,
                previousSuccessRate: previous.successRate,
            },
            statusTimeseries,
            internalErrors,
            nextRefreshAt,
        }
        await distributedStore.put(cacheKey, value, REPORT_TTL_SECONDS)
        return value
    },
    getQueueMetrics: async (platformId: PlatformId, window: ReportWindow): Promise<PlatformMetricsLive> => {
        const projectIds = await projectService(log).getProjectIdsByPlatform(platformId)
        if (projectIds.length === 0) {
            return { running: 0, queued: 0, stuckJobs: [] }
        }
        const [counts, stuckJobs] = await Promise.all([
            queueStatusCounts(projectIds, window),
            buildStuckJobs(projectIds, window),
        ])
        return {
            running: counts.get(FlowRunStatus.RUNNING) ?? 0,
            queued: counts.get(FlowRunStatus.QUEUED) ?? 0,
            stuckJobs,
        }
    },
    getHealthHistory: async (platformId: PlatformId): Promise<PlatformMetricsHealthHistory> => {
        const projectIds = await projectService(log).getProjectIdsByPlatform(platformId)
        if (projectIds.length === 0) {
            return { days: buildEmptyHealthHistory() }
        }
        return { days: await buildHealthHistory(projectIds) }
    },
})

const REPORT_CACHE_PREFIX = 'health-metrics:report'
const REPORT_TTL_SECONDS = apDayjsDuration(6, 'hours').asSeconds() // only run metrics is cached
const HEALTH_HISTORY_DAYS = 30
