import { AIProviderName } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import { AppConnectionType } from '../../../src/lib/automation/app-connection/app-connection'
import { FieldType } from '../../../src/lib/automation/tables/field'
import { TableAutomationStatus, TableAutomationTrigger } from '../../../src/lib/automation/tables/table'
import { ScheduledTaskStatus } from '../../../src/lib/execution/scheduled-task'
import { TriggerBindingStatus } from '../../../src/lib/execution/trigger-binding'
import {
    AgentSnapshotSchema,
    ConnectionMappingSchema,
    ConnectionPreflightReportSchema,
    MAX_CUSTOM_PIECE_ARCHIVE_BYTES,
    MAX_CUSTOM_PIECE_BASE64_LENGTH,
    McpServerSnapshotSchema,
    ProjectReplaceApplyRequest,
    ProjectReplaceApplyResult,
    ProjectReplaceArtifactSchema,
    ProjectReplaceDiffItem,
    ProjectReplaceOp,
    ProjectReplacePlan,
    ProjectReplaceResourceKind,
    ProjectStateSnapshot,
    ProviderMappingSchema,
    RequiredPieceSchema,
    ScheduledTaskSnapshotSchema,
    TableSnapshotSchema,
    TriggerBindingSnapshotSchema,
} from '../../../src/lib/management/project/project-replace'

describe('Project Replace Domain Contracts', () => {
    describe('Resource Kind and Operation Enums', () => {
        it('validates supported ProjectReplaceResourceKind enum values', () => {
            expect(ProjectReplaceResourceKind.parse('table')).toBe('table')
            expect(ProjectReplaceResourceKind.parse('agent')).toBe('agent')
            expect(ProjectReplaceResourceKind.parse('trigger_binding')).toBe('trigger_binding')
            expect(ProjectReplaceResourceKind.parse('scheduled_task')).toBe('scheduled_task')
            expect(ProjectReplaceResourceKind.parse('mcp_server')).toBe('mcp_server')
            expect(ProjectReplaceResourceKind.parse('custom_piece')).toBe('custom_piece')
            expect(ProjectReplaceResourceKind.parse('connection')).toBe('connection')
            expect(() => ProjectReplaceResourceKind.parse('unknown_resource')).toThrow()
        })

        it('validates supported ProjectReplaceOp enum values', () => {
            expect(ProjectReplaceOp.parse('CREATE')).toBe('CREATE')
            expect(ProjectReplaceOp.parse('UPDATE')).toBe('UPDATE')
            expect(ProjectReplaceOp.parse('DELETE')).toBe('DELETE')
            expect(ProjectReplaceOp.parse('ROTATE')).toBe('ROTATE')
            expect(() => ProjectReplaceOp.parse('PATCH')).toThrow()
        })
    })

    describe('Snapshot Schemas', () => {
        it('validates TableSnapshotSchema with fields, status, and trigger', () => {
            const table = {
                name: 'Customers',
                externalId: 'tbl_cust_01',
                fields: [
                    { name: 'Email', type: FieldType.TEXT, externalId: 'fld_email' },
                    { name: 'Age', type: FieldType.NUMBER },
                ],
                status: TableAutomationStatus.ENABLED,
                trigger: TableAutomationTrigger.ROW_CREATED,
            }
            const parsed = TableSnapshotSchema.parse(table)
            expect(parsed.name).toBe('Customers')
            expect(parsed.fields?.length).toBe(2)
            expect(parsed.status).toBe(TableAutomationStatus.ENABLED)
        })

        it('validates TriggerBindingSnapshotSchema', () => {
            const trigger = {
                externalId: 'trig_01',
                pieceName: 'slack',
                pieceVersion: '1.2.0',
                triggerName: 'new_message',
                promptTemplate: 'Handle new slack message: {{message}}',
                connectionExternalId: 'conn_slack_prod',
                settings: { channel: '#ops' },
                propertySettings: null,
                status: TriggerBindingStatus.ENABLED,
            }
            const parsed = TriggerBindingSnapshotSchema.parse(trigger)
            expect(parsed.triggerName).toBe('new_message')
            expect(parsed.status).toBe(TriggerBindingStatus.ENABLED)
        })

        it('validates ScheduledTaskSnapshotSchema', () => {
            const task = {
                externalId: 'sched_01',
                prompt: 'Run daily customer sync',
                cronExpression: '0 0 * * *',
                timezone: 'America/New_York',
                status: ScheduledTaskStatus.ENABLED,
            }
            const parsed = ScheduledTaskSnapshotSchema.parse(task)
            expect(parsed.cronExpression).toBe('0 0 * * *')
            expect(parsed.timezone).toBe('America/New_York')
        })

        it('validates McpServerSnapshotSchema and sets default externalId', () => {
            const mcp = McpServerSnapshotSchema.parse({
                disabledTools: ['dangerous_tool'],
            })
            expect(mcp.externalId).toBe('default')
            expect(mcp.disabledTools).toEqual(['dangerous_tool'])
        })

        it('validates AgentSnapshotSchema with default step count and status', () => {
            const agent = {
                externalId: 'agent_support_bot',
                displayName: 'Support Agent',
                prompt: 'You are a customer support agent.',
                model: {
                    provider: AIProviderName.OPENAI,
                    model: 'gpt-4o',
                },
            }
            const parsed = AgentSnapshotSchema.parse(agent)
            expect(parsed.displayName).toBe('Support Agent')
            expect(parsed.maxSteps).toBe(10)
            expect(parsed.status).toBe('ENABLED')
            expect(parsed.tools).toEqual([])
        })
    })

    describe('Piece and Provider Mapping Schemas', () => {
        it('validates ProviderMappingSchema', () => {
            const mapping = ProviderMappingSchema.parse({
                sourceProvider: 'openai',
                destProvider: 'azure-openai',
            })
            expect(mapping.sourceProvider).toBe('openai')
            expect(mapping.destProvider).toBe('azure-openai')
        })

        it('enforces maximum custom piece base64 archive length', () => {
            expect(MAX_CUSTOM_PIECE_ARCHIVE_BYTES).toBe(15 * 1024 * 1024)
            expect(MAX_CUSTOM_PIECE_BASE64_LENGTH).toBeGreaterThan(MAX_CUSTOM_PIECE_ARCHIVE_BYTES)

            const validPiece = {
                name: 'custom-internal-crm',
                version: '0.0.1',
                archiveFileBase64: 'UEsDBBQAAAAIAAA=',
            }
            expect(RequiredPieceSchema.parse(validPiece).name).toBe('custom-internal-crm')
        })
    })

    describe('ProjectStateSnapshot and ConnectionPreflightReport', () => {
        const minimalSnapshot = {
            schemaVersion: 1 as const,
            sourceActivepiecesVersion: '0.86.1',
            exportedAt: new Date().toISOString(),
            tables: [],
            triggerBindings: [],
            scheduledTasks: [],
            requiredPieces: [{ name: 'slack', version: '1.0.0' }],
            requiredConnections: [{ externalId: 'conn_1', pieceName: 'slack' }],
        }

        it('validates valid ProjectStateSnapshot with defaults', () => {
            const parsed = ProjectStateSnapshot.parse(minimalSnapshot)
            expect(parsed.schemaVersion).toBe(1)
            expect(parsed.agents).toEqual([])
        })

        it('validates ConnectionPreflightReportSchema', () => {
            const report = {
                required: [{ externalId: 'conn_slack', pieceName: 'slack' }],
                matched: [{
                    sourceExternalId: 'conn_slack',
                    destExternalId: 'conn_slack',
                    destConnectionId: 'conn_internal_id',
                    pieceName: 'slack',
                    status: 'ACTIVE',
                }],
                missing: [],
                mapped: [],
            }
            const parsed = ConnectionPreflightReportSchema.parse(report)
            expect(parsed.matched.length).toBe(1)
            expect(parsed.missing.length).toBe(0)
        })
    })

    describe('ProjectReplacePlan, Artifact, and Apply Result', () => {
        const dummyPlan = {
            planId: 'plan_test_123',
            schemaVersion: 1 as const,
            toolVersion: '1.0.0',
            createdAt: new Date().toISOString(),
            sourceActivepiecesVersion: '0.86.1',
            targetActivepiecesVersion: '0.86.1',
            targetProjectId: 'proj_123',
            checksum: 'sha256:abc123def456',
            destinationStateHash: 'sha256:targethash',
            signature: 'sig_hmac_test',
            preflight: {
                passed: true,
                errors: [],
                warnings: [],
            },
            changes: {
                creates: [{
                    kind: 'table' as const,
                    externalId: 'tbl_new',
                    op: 'CREATE' as const,
                }],
                updates: [],
                deletes: [],
                unchanged: [],
            },
            summary: {
                created: 1,
                updated: 0,
                deleted: 0,
                unchanged: 0,
            },
        }

        it('validates complete ProjectReplacePlan', () => {
            const parsed = ProjectReplacePlan.parse(dummyPlan)
            expect(parsed.planId).toBe('plan_test_123')
            expect(parsed.summary.created).toBe(1)
            expect(parsed.preflight.passed).toBe(true)
        })

        it('validates ProjectReplaceArtifactSchema packaging both snapshot and plan', () => {
            const artifact = {
                artifactVersion: 1 as const,
                toolVersion: '1.0.0',
                createdAt: new Date().toISOString(),
                snapshot: {
                    schemaVersion: 1 as const,
                    sourceActivepiecesVersion: '0.86.1',
                    exportedAt: new Date().toISOString(),
                    tables: [],
                    triggerBindings: [],
                    scheduledTasks: [],
                    requiredPieces: [],
                    requiredConnections: [],
                },
                plan: dummyPlan,
            }
            const parsed = ProjectReplaceArtifactSchema.parse(artifact)
            expect(parsed.artifactVersion).toBe(1)
            expect(parsed.plan.planId).toBe('plan_test_123')
        })

        it('validates ProjectReplaceApplyRequest with optional execution switches', () => {
            const req = {
                plan: dummyPlan,
                snapshot: {
                    schemaVersion: 1 as const,
                    sourceActivepiecesVersion: '0.86.1',
                    exportedAt: new Date().toISOString(),
                    tables: [],
                    triggerBindings: [],
                    scheduledTasks: [],
                    requiredPieces: [],
                    requiredConnections: [],
                },
                dryRun: true,
                force: false,
                providerMappings: [{ sourceProvider: 'openai', destProvider: 'anthropic' }],
            }
            const parsed = ProjectReplaceApplyRequest.parse(req)
            expect(parsed.dryRun).toBe(true)
            expect(parsed.providerMappings?.[0].destProvider).toBe('anthropic')
        })

        it('validates ProjectReplaceApplyResult metrics and failure reporting', () => {
            const result = {
                applied: {
                    tablesCreated: 1,
                    tablesUpdated: 0,
                    tablesDeleted: 0,
                    tablesUnchanged: 0,
                    agentsCreated: 0,
                    agentsUpdated: 0,
                    agentsDeleted: 0,
                    agentsUnchanged: 0,
                    triggerBindingsCreated: 0,
                    triggerBindingsUpdated: 0,
                    triggerBindingsDeleted: 0,
                    triggerBindingsUnchanged: 0,
                    scheduledTasksCreated: 0,
                    scheduledTasksUpdated: 0,
                    scheduledTasksDeleted: 0,
                    scheduledTasksUnchanged: 0,
                    mcpUpdated: 0,
                    customPiecesInstalled: 0,
                    customPiecesUnchanged: 0,
                    connectionsCreated: 0,
                    connectionsUpdated: 0,
                    connectionsUnchanged: 0,
                },
                failed: [],
                durationMs: 450,
            }
            const parsed = ProjectReplaceApplyResult.parse(result)
            expect(parsed.applied.tablesCreated).toBe(1)
            expect(parsed.applied.mcpCreated).toBe(0)
            expect(parsed.durationMs).toBe(450)
            expect(parsed.failed).toEqual([])
        })
    })
})
