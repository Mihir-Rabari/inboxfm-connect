import { FlowRunStatus } from '@inboxfm-connect/core-execution'
import { apId } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import { WebhookUrlParams } from '../../src/lib/automation/webhook'
import {
    LockResourceRequest,
    LockResourceResponse,
    PresenceRequest,
    PresenceUpdatedEvent,
    PresenceUser,
    ResourceLockedEvent,
    ResourceUnlockedEvent,
    WebsocketClientEvent,
    WebsocketServerEvent,
} from '../../src/lib/automation/websocket'
import {
    GetSystemHealthChecksResponse,
    PlatformMetricsLive,
    PlatformMetricsReport,
    PlatformMetricsReportRequest,
    PlatformMetricsStatusPoint,
    PlatformMetricsSummary,
    StuckJob,
} from '../../src/lib/core/health'
import {
    CreateTrialLicenseKeyRequestBody,
    LicenseKeyEntity,
    VerifyLicenseKeyRequestBody,
} from '../../src/lib/core/license-keys'

describe('License Keys, Health Metrics, and Realtime Contracts (#141)', () => {
    describe('License Keys', () => {
        describe('VerifyLicenseKeyRequestBody schema', () => {
            it('parses valid license verification request', () => {
                const parsed = VerifyLicenseKeyRequestBody.parse({
                    licenseKey: 'LIC-ENTERPRISE-12345',
                    platformId: 'plat-123',
                })
                expect(parsed.licenseKey).toBe('LIC-ENTERPRISE-12345')
                expect(parsed.platformId).toBe('plat-123')
            })

            it('rejects missing licenseKey or platformId', () => {
                expect(VerifyLicenseKeyRequestBody.safeParse({ licenseKey: 'abc' }).success).toBe(false)
                expect(VerifyLicenseKeyRequestBody.safeParse({ platformId: 'plat' }).success).toBe(false)
            })
        })

        describe('LicenseKeyEntity schema', () => {
            it('parses complete enterprise license entity', () => {
                const raw = {
                    id: 'lic-123',
                    email: 'admin@acme.corp',
                    expiresAt: '2027-01-01T00:00:00.000Z',
                    activatedAt: '2026-01-01T00:00:00.000Z',
                    createdAt: '2026-01-01T00:00:00.000Z',
                    key: 'KEY-XYZ',
                    ssoEnabled: true,
                    scimEnabled: true,
                    environmentsEnabled: true,
                    showPoweredBy: false,
                    embeddingEnabled: true,
                    auditLogEnabled: true,
                    customAppearanceEnabled: true,
                    manageProjectsEnabled: true,
                    managePiecesEnabled: true,
                    manageTemplatesEnabled: true,
                    apiKeysEnabled: true,
                    projectRolesEnabled: true,
                    analyticsEnabled: true,
                    globalConnectionsEnabled: true,
                    customRolesEnabled: true,
                    eventStreamingEnabled: true,
                    secretManagersEnabled: true,
                    agentsEnabled: true,
                    aiProvidersEnabled: true,
                    chatEnabled: true,
                    workerGroupsEnabled: false,
                }
                const parsed = LicenseKeyEntity.parse(raw)
                expect(parsed.ssoEnabled).toBe(true)
                expect(parsed.auditLogEnabled).toBe(true)
                expect(parsed.showPoweredBy).toBe(false)
            })
        })

        describe('CreateTrialLicenseKeyRequestBody schema', () => {
            it('parses trial creation with metadata and feature flags', () => {
                const raw = {
                    email: 'trial@example.com',
                    companyName: 'Acme Logistics',
                    goal: 'Evaluate AI Agents and Workflow Orchestration',
                    keyType: 'TRIAL',
                    ssoEnabled: true,
                    scimEnabled: false,
                    environmentsEnabled: true,
                    showPoweredBy: true,
                    embeddingEnabled: true,
                    auditLogEnabled: false,
                    customAppearanceEnabled: false,
                    manageProjectsEnabled: true,
                    managePiecesEnabled: true,
                    manageTemplatesEnabled: true,
                    apiKeysEnabled: true,
                    projectRolesEnabled: false,
                    analyticsEnabled: false,
                    globalConnectionsEnabled: false,
                    customRolesEnabled: false,
                    eventStreamingEnabled: false,
                    secretManagersEnabled: false,
                    agentsEnabled: true,
                    aiProvidersEnabled: true,
                }
                const parsed = CreateTrialLicenseKeyRequestBody.parse(raw)
                expect(parsed.companyName).toBe('Acme Logistics')
                expect(parsed.agentsEnabled).toBe(true)
            })
        })
    })

    describe('System Health and Metrics', () => {
        describe('GetSystemHealthChecksResponse schema', () => {
            it('parses system diagnostic check status', () => {
                const parsed = GetSystemHealthChecksResponse.parse({
                    latestVersion: '0.86.1',
                    appCpu: true,
                    appRam: true,
                    disk: true,
                    workerCpu: true,
                    workerRam: true,
                    database: true,
                })
                expect(parsed.database).toBe(true)
                expect(parsed.workerCpu).toBe(true)
            })

            it('allows null workerCpu and workerRam in standalone mode', () => {
                const parsed = GetSystemHealthChecksResponse.parse({
                    latestVersion: '0.86.1',
                    appCpu: true,
                    appRam: true,
                    disk: true,
                    workerCpu: null,
                    workerRam: null,
                    database: true,
                })
                expect(parsed.workerCpu).toBeNull()
            })
        })

        describe('PlatformMetrics schemas', () => {
            it('validates PlatformMetricsReportRequest date bounds', () => {
                const parsed = PlatformMetricsReportRequest.parse({
                    createdAfter: '2026-09-01T00:00:00.000Z',
                    createdBefore: '2026-10-01T00:00:00.000Z',
                })
                expect(parsed.createdAfter).toBe('2026-09-01T00:00:00.000Z')
            })

            it('validates PlatformMetricsSummary metrics', () => {
                const parsed = PlatformMetricsSummary.parse({
                    completed: 12500,
                    successRate: 0.985,
                    previousCompleted: 11000,
                    previousSuccessRate: 0.972,
                })
                expect(parsed.successRate).toBe(0.985)
            })

            it('validates PlatformMetricsStatusPoint with FlowRunStatus enum', () => {
                const parsed = PlatformMetricsStatusPoint.parse({
                    day: '2026-10-01',
                    status: FlowRunStatus.SUCCEEDED,
                    count: 420,
                })
                expect(parsed.status).toBe(FlowRunStatus.SUCCEEDED)
            })

            it('validates PlatformMetricsReport aggregate structure', () => {
                const report = PlatformMetricsReport.parse({
                    summary: {
                        completed: 100,
                        successRate: 1.0,
                        previousCompleted: 90,
                        previousSuccessRate: 0.95,
                    },
                    statusTimeseries: [
                        { day: '2026-10-01', status: FlowRunStatus.SUCCEEDED, count: 95 },
                        { day: '2026-10-01', status: FlowRunStatus.FAILED, count: 5 },
                    ],
                    internalErrors: [
                        {
                            projectId: apId(),
                            projectName: 'Default Project',
                            flowId: apId(),
                            flowName: 'Lead Enrichment',
                            count: 2,
                        },
                    ],
                    nextRefreshAt: '2026-10-04T00:00:00.000Z',
                })
                expect(report.summary.completed).toBe(100)
                expect(report.internalErrors).toHaveLength(1)
            })

            it('validates PlatformMetricsLive with stuck jobs', () => {
                const live = PlatformMetricsLive.parse({
                    running: 4,
                    queued: 12,
                    stuckJobs: [
                        {
                            flowRunId: apId(),
                            flowId: apId(),
                            flowName: 'Bulk Data Sync',
                            projectId: apId(),
                            projectName: 'Prod Workspace',
                            status: FlowRunStatus.RUNNING,
                        },
                    ],
                })
                expect(live.running).toBe(4)
                expect(live.stuckJobs[0]?.flowName).toBe('Bulk Data Sync')
            })
        })
    })

    describe('Webhooks and Websocket Contracts', () => {
        describe('WebhookUrlParams schema', () => {
            it('validates ApId format in WebhookUrlParams', () => {
                const validId = apId()
                const parsed = WebhookUrlParams.parse({ flowId: validId })
                expect(parsed.flowId).toBe(validId)
            })
        })

        describe('Websocket Enums', () => {
            it('exports expected WebsocketClientEvent values', () => {
                expect(WebsocketClientEvent.TEST_FLOW_RUN_STARTED).toBe('TEST_FLOW_RUN_STARTED')
                expect(WebsocketClientEvent.RESOURCE_LOCKED).toBe('RESOURCE_LOCKED')
                expect(WebsocketClientEvent.RESOURCE_UNLOCKED).toBe('RESOURCE_UNLOCKED')
                expect(WebsocketClientEvent.PRESENCE_UPDATED).toBe('PRESENCE_UPDATED')
                expect(WebsocketClientEvent.CHAT_MESSAGE_CHUNK).toBe('CHAT_MESSAGE_CHUNK')
            })

            it('exports expected WebsocketServerEvent values', () => {
                expect(WebsocketServerEvent.CONNECT).toBe('CONNECT')
                expect(WebsocketServerEvent.DISCONNECT).toBe('DISCONNECT')
                expect(WebsocketServerEvent.LOCK_RESOURCE).toBe('LOCK_RESOURCE')
                expect(WebsocketServerEvent.UNLOCK_RESOURCE).toBe('UNLOCK_RESOURCE')
                expect(WebsocketServerEvent.JOIN_PRESENCE).toBe('JOIN_PRESENCE')
                expect(WebsocketServerEvent.LEAVE_PRESENCE).toBe('LEAVE_PRESENCE')
            })
        })

        describe('Websocket Payloads', () => {
            it('parses LockResourceRequest and LockResourceResponse', () => {
                const req = LockResourceRequest.parse({ resourceId: 'flow-1', force: true })
                expect(req.force).toBe(true)

                const respAcquired = LockResourceResponse.parse({
                    acquired: true,
                    lock: { userId: 'user-1', userDisplayName: 'Alice' },
                })
                expect(respAcquired.acquired).toBe(true)

                const respFree = LockResourceResponse.parse({
                    acquired: false,
                    lock: null,
                })
                expect(respFree.lock).toBeNull()
            })

            it('parses ResourceLockedEvent and ResourceUnlockedEvent', () => {
                const locked = ResourceLockedEvent.parse({
                    resourceId: 'flow-1',
                    userId: 'user-1',
                    userDisplayName: 'Bob',
                })
                expect(locked.userDisplayName).toBe('Bob')

                const unlocked = ResourceUnlockedEvent.parse({ resourceId: 'flow-1' })
                expect(unlocked.resourceId).toBe('flow-1')
            })

            it('parses PresenceRequest, PresenceUser, and PresenceUpdatedEvent', () => {
                const presenceReq = PresenceRequest.parse({ resourceId: 'flow-abc' })
                expect(presenceReq.resourceId).toBe('flow-abc')

                const presenceUser = PresenceUser.parse({
                    userId: 'user-2',
                    userDisplayName: 'Carol',
                    userEmail: 'carol@example.com',
                    userImageUrl: 'https://example.com/avatar.png',
                })
                expect(presenceUser.userEmail).toBe('carol@example.com')

                const presenceEvent = PresenceUpdatedEvent.parse({
                    resourceId: 'flow-abc',
                    users: [presenceUser],
                })
                expect(presenceEvent.users).toHaveLength(1)
            })
        })
    })
})
