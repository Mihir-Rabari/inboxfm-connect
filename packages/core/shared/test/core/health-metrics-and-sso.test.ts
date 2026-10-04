import { FlowRunStatus } from '@inboxfm-connect/core-execution'
import { apId } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import {
    InternalErrorImpactItem,
    PlatformMetricsHealthDay,
    PlatformMetricsHealthHistory,
    PlatformMetricsLive,
    PlatformMetricsReport,
    PlatformMetricsReportRequest,
    PlatformMetricsStatusPoint,
    PlatformMetricsSummary,
    StuckJob,
} from '../../src/lib/core/health/health-metrics-request'
import {
    SsoDomainVerification,
    SsoDomainVerificationRecord,
    SsoDomainVerificationRecordType,
    SsoDomainVerificationStatus,
} from '../../src/lib/management/platform/sso-domain-verification'

describe('Platform Health Metrics and SSO Domain Verification Contracts (#141)', () => {
    describe('PlatformMetricsReportRequest schema', () => {
        it('parses valid date range request', () => {
            const raw = {
                createdAfter: '2026-10-01T00:00:00.000Z',
                createdBefore: '2026-10-04T00:00:00.000Z',
            }
            const parsed = PlatformMetricsReportRequest.parse(raw)
            expect(parsed.createdAfter).toBe('2026-10-01T00:00:00.000Z')
            expect(parsed.createdBefore).toBe('2026-10-04T00:00:00.000Z')
        })

        it('rejects request missing required timestamp bounds', () => {
            const result = PlatformMetricsReportRequest.safeParse({
                createdAfter: '2026-10-01T00:00:00.000Z',
            })
            expect(result.success).toBe(false)
        })
    })

    describe('PlatformMetricsSummary schema', () => {
        it('parses metric summary counts and percentages', () => {
            const summary = PlatformMetricsSummary.parse({
                completed: 1250,
                successRate: 98.4,
                previousCompleted: 1100,
                previousSuccessRate: 97.2,
            })
            expect(summary.completed).toBe(1250)
            expect(summary.successRate).toBe(98.4)
            expect(summary.previousCompleted).toBe(1100)
            expect(summary.previousSuccessRate).toBe(97.2)
        })

        it('rejects non-numeric rates', () => {
            const result = PlatformMetricsSummary.safeParse({
                completed: 100,
                successRate: '98%',
                previousCompleted: 90,
                previousSuccessRate: 95,
            })
            expect(result.success).toBe(false)
        })
    })

    describe('PlatformMetricsStatusPoint schema', () => {
        it('parses status distribution points across FlowRunStatus values', () => {
            const pointSucceeded = PlatformMetricsStatusPoint.parse({
                day: '2026-10-02',
                status: FlowRunStatus.SUCCEEDED,
                count: 850,
            })
            expect(pointSucceeded.status).toBe(FlowRunStatus.SUCCEEDED)
            expect(pointSucceeded.count).toBe(850)

            const pointFailed = PlatformMetricsStatusPoint.parse({
                day: '2026-10-02',
                status: FlowRunStatus.FAILED,
                count: 14,
            })
            expect(pointFailed.status).toBe(FlowRunStatus.FAILED)

            const pointInternalError = PlatformMetricsStatusPoint.parse({
                day: '2026-10-02',
                status: FlowRunStatus.INTERNAL_ERROR,
                count: 2,
            })
            expect(pointInternalError.status).toBe(FlowRunStatus.INTERNAL_ERROR)
        })
    })

    describe('InternalErrorImpactItem schema', () => {
        it('validates internal error incident mapping by flow and project', () => {
            const item = InternalErrorImpactItem.parse({
                projectId: apId(),
                projectName: 'Marketing Operations',
                flowId: apId(),
                flowName: 'Sync Leads Webhook',
                count: 5,
            })
            expect(item.projectName).toBe('Marketing Operations')
            expect(item.flowName).toBe('Sync Leads Webhook')
            expect(item.count).toBe(5)
        })

        it('rejects invalid ApId format for projectId', () => {
            const result = InternalErrorImpactItem.safeParse({
                projectId: 'invalid_id_with_underscores',
                projectName: 'Ops',
                flowId: apId(),
                flowName: 'Sync',
                count: 1,
            })
            expect(result.success).toBe(false)
        })
    })

    describe('PlatformMetricsReport aggregate schema', () => {
        it('parses full metric report with timeseries and error impact list', () => {
            const report = PlatformMetricsReport.parse({
                summary: {
                    completed: 5000,
                    successRate: 99.1,
                    previousCompleted: 4800,
                    previousSuccessRate: 98.9,
                },
                statusTimeseries: [
                    { day: '2026-10-01', status: FlowRunStatus.SUCCEEDED, count: 2400 },
                    { day: '2026-10-01', status: FlowRunStatus.FAILED, count: 20 },
                ],
                internalErrors: [
                    {
                        projectId: apId(),
                        projectName: 'Finance',
                        flowId: apId(),
                        flowName: 'Invoice Processing',
                        count: 1,
                    },
                ],
                nextRefreshAt: '2026-10-04T12:00:00.000Z',
            })
            expect(report.summary.completed).toBe(5000)
            expect(report.statusTimeseries).toHaveLength(2)
            expect(report.internalErrors).toHaveLength(1)
        })
    })

    describe('PlatformMetricsLive and StuckJob schemas', () => {
        it('parses stuck job descriptor', () => {
            const stuck = StuckJob.parse({
                flowRunId: apId(),
                flowId: apId(),
                flowName: 'High-Volume Order Poller',
                projectId: apId(),
                projectName: 'E-Commerce',
                status: FlowRunStatus.RUNNING,
            })
            expect(stuck.flowName).toBe('High-Volume Order Poller')
            expect(stuck.status).toBe(FlowRunStatus.RUNNING)
        })

        it('parses live system queue metrics', () => {
            const live = PlatformMetricsLive.parse({
                running: 12,
                queued: 45,
                stuckJobs: [
                    {
                        flowRunId: apId(),
                        flowId: apId(),
                        flowName: 'Long-running batch job',
                        projectId: apId(),
                        projectName: 'Analytics',
                        status: FlowRunStatus.PAUSED,
                    },
                ],
            })
            expect(live.running).toBe(12)
            expect(live.queued).toBe(45)
            expect(live.stuckJobs).toHaveLength(1)
        })
    })

    describe('PlatformMetricsHealthDay and PlatformMetricsHealthHistory schemas', () => {
        it('parses daily health record and historical series', () => {
            const day = PlatformMetricsHealthDay.parse({
                day: '2026-10-03',
                internalErrors: 0,
                affectedFlows: 0,
                stuckJobs: 1,
            })
            expect(day.day).toBe('2026-10-03')
            expect(day.internalErrors).toBe(0)

            const history = PlatformMetricsHealthHistory.parse({
                days: [day],
            })
            expect(history.days).toHaveLength(1)
            expect(history.days[0]?.stuckJobs).toBe(1)
        })
    })

    describe('SSO Domain Verification Contracts', () => {
        it('defines valid SsoDomainVerificationStatus and SsoDomainVerificationRecordType enums', () => {
            expect(SsoDomainVerificationStatus.PENDING_VERIFICATION).toBe('PENDING_VERIFICATION')
            expect(SsoDomainVerificationStatus.VERIFIED).toBe('VERIFIED')
            expect(SsoDomainVerificationRecordType.TXT).toBe('TXT')
        })

        it('parses valid SsoDomainVerificationRecord schema', () => {
            const record = SsoDomainVerificationRecord.parse({
                type: SsoDomainVerificationRecordType.TXT,
                name: 'inboxfm-verify.acme-corp.com',
                value: 'inboxfm-site-verification=abc-def-98765',
            })
            expect(record.type).toBe('TXT')
            expect(record.name).toBe('inboxfm-verify.acme-corp.com')
            expect(record.value).toBe('inboxfm-site-verification=abc-def-98765')
        })

        it('parses full SsoDomainVerification entity schema', () => {
            const verification = SsoDomainVerification.parse({
                status: SsoDomainVerificationStatus.PENDING_VERIFICATION,
                record: {
                    type: SsoDomainVerificationRecordType.TXT,
                    name: '_inboxfm-challenge.enterprise.io',
                    value: 'challenge-string-12345',
                },
                createdAt: '2026-10-01T08:00:00.000Z',
            })
            expect(verification.status).toBe(SsoDomainVerificationStatus.PENDING_VERIFICATION)
            expect(verification.record.name).toBe('_inboxfm-challenge.enterprise.io')
            expect(verification.createdAt).toBe('2026-10-01T08:00:00.000Z')
        })

        it('rejects unsupported record type in verification record', () => {
            const result = SsoDomainVerificationRecord.safeParse({
                type: 'CNAME',
                name: 'verify.example.com',
                value: 'example.com',
            })
            expect(result.success).toBe(false)
        })
    })
})
