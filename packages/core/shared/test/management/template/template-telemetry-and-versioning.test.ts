import { describe, expect, it } from 'vitest'
import {
    McpProperty,
    McpPropertyType,
    McpTrigger,
} from '../../../src/lib/automation/mcp/pieces/mcp-piece'
import { getPieceMajorAndMinorVersion } from '../../../src/lib/automation/pieces/version-utils'
import { formErrors } from '../../../src/lib/form-errors'
import { GetFlowTemplateRequestQuery } from '../../../src/lib/management/template/flow-template/flow-template.request'
import {
    TemplateTelemetryEvent,
    TemplateTelemetryEventType,
} from '../../../src/lib/management/template/template-telemetry'

describe('Template Telemetry, Piece Versioning, and MCP Contracts (#141)', () => {
    describe('Template Telemetry Contracts', () => {
        it('defines all valid TemplateTelemetryEventType enum values', () => {
            expect(TemplateTelemetryEventType.VIEW).toBe('VIEW')
            expect(TemplateTelemetryEventType.INSTALL).toBe('INSTALL')
            expect(TemplateTelemetryEventType.ACTIVATE).toBe('ACTIVATE')
            expect(TemplateTelemetryEventType.DEACTIVATE).toBe('DEACTIVATE')
            expect(TemplateTelemetryEventType.EXPLORE_VIEW).toBe('EXPLORE_VIEW')
        })

        it('parses VIEW telemetry event', () => {
            const event = TemplateTelemetryEvent.parse({
                eventType: TemplateTelemetryEventType.VIEW,
                templateId: 'tmpl-welcome-flow',
            })
            expect(event.eventType).toBe('VIEW')
            expect(event.templateId).toBe('tmpl-welcome-flow')
        })

        it('parses INSTALL telemetry event with user association', () => {
            const event = TemplateTelemetryEvent.parse({
                eventType: TemplateTelemetryEventType.INSTALL,
                templateId: 'tmpl-crm-sync',
                userId: 'usr-456',
            })
            expect(event.eventType).toBe('INSTALL')
            expect(event.templateId).toBe('tmpl-crm-sync')
            if (event.eventType === TemplateTelemetryEventType.INSTALL) {
                expect(event.userId).toBe('usr-456')
            }
        })

        it('parses ACTIVATE and DEACTIVATE telemetry events with flowId', () => {
            const activate = TemplateTelemetryEvent.parse({
                eventType: TemplateTelemetryEventType.ACTIVATE,
                templateId: 'tmpl-1',
                flowId: 'flow-abc',
            })
            expect(activate.eventType).toBe('ACTIVATE')
            if (activate.eventType === TemplateTelemetryEventType.ACTIVATE) {
                expect(activate.flowId).toBe('flow-abc')
            }

            const deactivate = TemplateTelemetryEvent.parse({
                eventType: TemplateTelemetryEventType.DEACTIVATE,
                templateId: 'tmpl-1',
                flowId: 'flow-abc',
            })
            expect(deactivate.eventType).toBe('DEACTIVATE')
            if (deactivate.eventType === TemplateTelemetryEventType.DEACTIVATE) {
                expect(deactivate.flowId).toBe('flow-abc')
            }
        })

        it('parses EXPLORE_VIEW event with optional userId', () => {
            const withUser = TemplateTelemetryEvent.parse({
                eventType: TemplateTelemetryEventType.EXPLORE_VIEW,
                userId: 'usr-123',
            })
            expect(withUser.eventType).toBe('EXPLORE_VIEW')

            const anonymous = TemplateTelemetryEvent.parse({
                eventType: TemplateTelemetryEventType.EXPLORE_VIEW,
            })
            expect(anonymous.eventType).toBe('EXPLORE_VIEW')
        })

        it('rejects unrecognized eventType', () => {
            const result = TemplateTelemetryEvent.safeParse({
                eventType: 'UNKNOWN_EVENT',
                templateId: 'tmpl-1',
            })
            expect(result.success).toBe(false)
        })
    })

    describe('GetFlowTemplateRequestQuery schema', () => {
        it('parses valid query with versionId', () => {
            const parsed = GetFlowTemplateRequestQuery.parse({ versionId: 'ver-123' })
            expect(parsed.versionId).toBe('ver-123')
        })

        it('parses empty query with optional versionId', () => {
            const parsed = GetFlowTemplateRequestQuery.parse({})
            expect(parsed.versionId).toBeUndefined()
        })
    })

    describe('Piece Version Utility (getPieceMajorAndMinorVersion)', () => {
        it('extracts major and minor from standard semver', () => {
            expect(getPieceMajorAndMinorVersion('1.2.3')).toBe('1.2')
            expect(getPieceMajorAndMinorVersion('0.15.2')).toBe('0.15')
            expect(getPieceMajorAndMinorVersion('3.0.0')).toBe('3.0')
        })

        it('extracts major and minor from prerelease versions', () => {
            expect(getPieceMajorAndMinorVersion('2.4.0-beta.1')).toBe('2.4')
            expect(getPieceMajorAndMinorVersion('1.0.0-rc.2')).toBe('1.0')
        })

        it('extracts major and minor from caret ranges', () => {
            expect(getPieceMajorAndMinorVersion('^1.5.0')).toBe('1.5')
            expect(getPieceMajorAndMinorVersion('^0.4.1')).toBe('0.4')
        })

        it('extracts major and minor from tilde ranges', () => {
            expect(getPieceMajorAndMinorVersion('~2.3.8')).toBe('2.3')
        })

        it('extracts major and minor from comparison ranges', () => {
            expect(getPieceMajorAndMinorVersion('>=3.1.0')).toBe('3.1')
        })
    })

    describe('MCP Piece and Trigger Schemas', () => {
        it('defines valid McpPropertyType enum values', () => {
            expect(McpPropertyType.TEXT).toBe('Text')
            expect(McpPropertyType.BOOLEAN).toBe('Boolean')
            expect(McpPropertyType.DATE).toBe('Date')
            expect(McpPropertyType.NUMBER).toBe('Number')
            expect(McpPropertyType.ARRAY).toBe('Array')
            expect(McpPropertyType.OBJECT).toBe('Object')
        })

        it('parses McpProperty schema', () => {
            const prop = McpProperty.parse({
                name: 'channelId',
                description: 'The Slack channel ID',
                type: McpPropertyType.TEXT,
                required: true,
            })
            expect(prop.name).toBe('channelId')
            expect(prop.required).toBe(true)
        })

        it('parses McpTrigger schema', () => {
            const trigger = McpTrigger.parse({
                pieceName: '@inboxfm-connect/piece-slack',
                triggerName: 'new_message',
                input: {
                    toolName: 'slack_new_message',
                    toolDescription: 'Triggers when a new message is posted to a Slack channel',
                    inputSchema: [
                        {
                            name: 'channel',
                            type: McpPropertyType.TEXT,
                            required: true,
                        },
                    ],
                    returnsResponse: true,
                },
            })
            expect(trigger.pieceName).toBe('@inboxfm-connect/piece-slack')
            expect(trigger.input.toolName).toBe('slack_new_message')
            expect(trigger.input.returnsResponse).toBe(true)
            expect(trigger.input.inputSchema).toHaveLength(1)
        })
    })

    describe('formErrors constants integrity', () => {
        it('contains expected system form error codes', () => {
            expect(formErrors.required).toBe('required')
            expect(formErrors.invalidGitRepoSlug).toBe('invalidGitRepoSlug')
            expect(formErrors.invalidGitRepoBranch).toBe('invalidGitRepoBranch')
            expect(formErrors.invalidGitRepoRemoteUrl).toBe('invalidGitRepoRemoteUrl')
            expect(formErrors.invalidExternalId).toBe('invalidExternalId')
            expect(formErrors.invalidHexColor).toBe('invalidHexColor')
            expect(formErrors.apiKeyExpiryMustBeFuture).toBe('apiKeyExpiryMustBeFuture')
            expect(formErrors.invalidCloudflareAccountId).toBe('invalidCloudflareAccountId')
            expect(formErrors.invalidCloudflareGatewayId).toBe('invalidCloudflareGatewayId')
            expect(formErrors.invalidAzureResourceName).toBe('invalidAzureResourceName')
        })
    })
})
