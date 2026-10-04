import { FlowStatus } from '@inboxfm-connect/core-execution'
import { apId } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import {
    AiToolAuthConfig,
    AiToolCapability,
    AiToolConfig,
    AiToolConfigWithoutSensitiveData,
    AiToolProvider,
    CreateAiToolConfigRequest,
    PROVIDERS_BY_CAPABILITY,
    UpdateAiToolConfigRequest,
} from '../../../src/lib/management/ai-tools'
import {
    AnalyticsFlowReportItem,
    AnalyticsReportRequest,
    AnalyticsRunsUsageItem,
    AnalyticsTimePeriod,
    PlatformAnalyticsReport,
} from '../../../src/lib/management/analytics'

describe('AI Tools and Analytics Contracts (#141)', () => {
    describe('AI Tools Contracts', () => {
        describe('Enums and Capability Mapping', () => {
            it('defines valid AiToolCapability enum values', () => {
                expect(AiToolCapability.WEB_SEARCH).toBe('WEB_SEARCH')
                expect(AiToolCapability.WEB_SCRAPING).toBe('WEB_SCRAPING')
                expect(AiToolCapability.IMAGE_GENERATION).toBe('IMAGE_GENERATION')
            })

            it('defines valid AiToolProvider enum values', () => {
                expect(AiToolProvider.TAVILY).toBe('tavily')
                expect(AiToolProvider.FIRECRAWL).toBe('firecrawl')
                expect(AiToolProvider.APIFY).toBe('apify')
                expect(AiToolProvider.FAL).toBe('fal')
            })

            it('maps correct providers for each capability', () => {
                expect(PROVIDERS_BY_CAPABILITY[AiToolCapability.WEB_SEARCH]).toEqual([AiToolProvider.TAVILY])
                expect(PROVIDERS_BY_CAPABILITY[AiToolCapability.WEB_SCRAPING]).toEqual([
                    AiToolProvider.FIRECRAWL,
                    AiToolProvider.APIFY,
                ])
                expect(PROVIDERS_BY_CAPABILITY[AiToolCapability.IMAGE_GENERATION]).toEqual([AiToolProvider.FAL])
            })
        })

        describe('AiToolAuthConfig schema', () => {
            it('parses valid API key auth config', () => {
                const parsed = AiToolAuthConfig.parse({ apiKey: 'test-api-key' })
                expect(parsed.apiKey).toBe('test-api-key')
            })

            it('rejects empty API key string', () => {
                const result = AiToolAuthConfig.safeParse({ apiKey: '' })
                expect(result.success).toBe(false)
            })
        })

        describe('AiToolConfig and AiToolConfigWithoutSensitiveData schemas', () => {
            it('parses complete AiToolConfig entity', () => {
                const raw = {
                    id: apId(),
                    created: '2026-10-01T00:00:00.000Z',
                    updated: '2026-10-01T00:00:00.000Z',
                    platformId: apId(),
                    capability: AiToolCapability.WEB_SEARCH,
                    provider: AiToolProvider.TAVILY,
                    config: { searchDepth: 'advanced' },
                    enabled: true,
                }
                const parsed = AiToolConfig.parse(raw)
                expect(parsed.capability).toBe('WEB_SEARCH')
                expect(parsed.enabled).toBe(true)
            })

            it('parses AiToolConfig with null config options', () => {
                const raw = {
                    id: apId(),
                    created: '2026-10-01T00:00:00.000Z',
                    updated: '2026-10-01T00:00:00.000Z',
                    platformId: apId(),
                    capability: AiToolCapability.IMAGE_GENERATION,
                    provider: AiToolProvider.FAL,
                    config: null,
                    enabled: false,
                }
                const parsed = AiToolConfig.parse(raw)
                expect(parsed.config).toBeNull()
                expect(parsed.enabled).toBe(false)
            })

            it('parses sanitized AiToolConfigWithoutSensitiveData reporting hasApiKey flag', () => {
                const raw = {
                    id: 'tool-config-1',
                    capability: AiToolCapability.WEB_SCRAPING,
                    provider: AiToolProvider.FIRECRAWL,
                    config: null,
                    enabled: true,
                    hasApiKey: true,
                }
                const parsed = AiToolConfigWithoutSensitiveData.parse(raw)
                expect(parsed.hasApiKey).toBe(true)
                expect(parsed.provider).toBe('firecrawl')
            })
        })

        describe('CreateAiToolConfigRequest and UpdateAiToolConfigRequest schemas', () => {
            it('parses valid CreateAiToolConfigRequest', () => {
                const parsed = CreateAiToolConfigRequest.parse({
                    capability: AiToolCapability.WEB_SEARCH,
                    provider: AiToolProvider.TAVILY,
                    auth: { apiKey: 'test-api-key' },
                    config: { maxResults: 5 },
                    enabled: true,
                })
                expect(parsed.capability).toBe('WEB_SEARCH')
                expect(parsed.auth.apiKey).toBe('test-api-key')
            })

            it('parses valid UpdateAiToolConfigRequest', () => {
                const parsed = UpdateAiToolConfigRequest.parse({
                    enabled: false,
                    config: { timeoutMs: 30000 },
                })
                expect(parsed.enabled).toBe(false)
            })
        })
    })

    describe('Analytics Contracts', () => {
        describe('AnalyticsTimePeriod enum', () => {
            it('defines expected analytics time ranges', () => {
                expect(AnalyticsTimePeriod.LAST_WEEK).toBe('last-week')
                expect(AnalyticsTimePeriod.LAST_MONTH).toBe('last-month')
                expect(AnalyticsTimePeriod.LAST_THREE_MONTHS).toBe('last-three-months')
                expect(AnalyticsTimePeriod.LAST_SIX_MONTHS).toBe('last-six-months')
                expect(AnalyticsTimePeriod.LAST_YEAR).toBe('last-year')
            })
        })

        describe('AnalyticsReportRequest schema', () => {
            it('parses request with valid time period', () => {
                const parsed = AnalyticsReportRequest.parse({
                    timePeriod: AnalyticsTimePeriod.LAST_MONTH,
                })
                expect(parsed.timePeriod).toBe('last-month')
            })

            it('accepts empty object when timePeriod is omitted', () => {
                const parsed = AnalyticsReportRequest.parse({})
                expect(parsed.timePeriod).toBeUndefined()
            })
        })

        describe('AnalyticsRunsUsageItem and AnalyticsFlowReportItem schemas', () => {
            it('parses daily flow run execution count point', () => {
                const point = AnalyticsRunsUsageItem.parse({
                    day: '2026-10-01',
                    flowId: 'flow-123',
                    runs: 1540,
                })
                expect(point.day).toBe('2026-10-01')
                expect(point.runs).toBe(1540)
            })

            it('parses flow report metrics item with nullable fields', () => {
                const item = AnalyticsFlowReportItem.parse({
                    flowId: 'flow-abc',
                    flowName: 'Customer Invoicing Flow',
                    projectId: 'proj-xyz',
                    projectName: 'Finance',
                    status: FlowStatus.ENABLED,
                    timeSavedPerRun: 120,
                    ownerId: null,
                })
                expect(item.flowName).toBe('Customer Invoicing Flow')
                expect(item.status).toBe('ENABLED')
                expect(item.ownerId).toBeNull()
            })
        })

        describe('PlatformAnalyticsReport aggregate schema', () => {
            it('parses full platform analytics report', () => {
                const report = PlatformAnalyticsReport.parse({
                    id: apId(),
                    created: '2026-10-01T00:00:00.000Z',
                    updated: '2026-10-01T00:00:00.000Z',
                    cachedAt: '2026-10-04T00:00:00.000Z',
                    runs: [
                        { day: '2026-10-01', flowId: 'flow-1', runs: 200 },
                        { day: '2026-10-02', flowId: 'flow-1', runs: 250 },
                    ],
                    outdated: false,
                    flows: [
                        {
                            flowId: 'flow-1',
                            flowName: 'Sync Contacts',
                            projectId: 'proj-1',
                            projectName: 'Main Project',
                            status: FlowStatus.ENABLED,
                            timeSavedPerRun: 45,
                            ownerId: 'user-1',
                        },
                    ],
                    platformId: apId(),
                    users: [],
                })
                expect(report.outdated).toBe(false)
                expect(report.runs).toHaveLength(2)
                expect(report.flows[0]?.flowName).toBe('Sync Contacts')
            })
        })
    })
})
