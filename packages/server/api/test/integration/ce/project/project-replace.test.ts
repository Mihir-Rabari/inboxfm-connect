import { apId } from '@inboxfm-connect/core-utils'
import {
    AppConnectionScope,
    AppConnectionType,
    ConnectionMappingSchema,
    FieldType,
    PackageType,
    PieceType,
    ProjectReplaceArtifact,
    ProjectStateSnapshot,
    TableAutomationStatus,
    TableAutomationTrigger,
} from '@inboxfm-connect/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { vi } from 'vitest'
import { appConnectionService } from '../../../../src/app/app-connection/app-connection-service/app-connection-service'
import { userInteractionWatcher } from '../../../../src/app/helper/user-interaction/user-interaction-watcher'
import { createTestContext, TestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Project Replace API (CE)', () => {
    let ctx: TestContext

    beforeEach(async () => {
        ctx = await createTestContext(app!)
    })

    describe('Export Snapshot', () => {
        it('should export clean snapshot with schema-only and zero secrets', async () => {
            const response = await app!.inject({
                method: 'GET',
                url: `/api/v1/projects/${ctx.project.id}/replace/export`,
                headers: { authorization: `Bearer ${ctx.token}` },
            })

            expect(response.statusCode).toBe(StatusCodes.OK)
            const snapshot: ProjectStateSnapshot = response.json()
            expect(snapshot.schemaVersion).toBe(1)
            expect(snapshot.sourceActivepiecesVersion).toBeDefined()
            expect(Array.isArray(snapshot.tables)).toBe(true)
            expect(Array.isArray(snapshot.triggerBindings)).toBe(true)
            expect(Array.isArray(snapshot.scheduledTasks)).toBe(true)
            expect(Array.isArray(snapshot.requiredPieces)).toBe(true)
            expect(Array.isArray(snapshot.requiredConnections)).toBe(true)
            expect(snapshot.mcp).toBeDefined()
        })
    })

    describe('Plan Generation (Dry-run)', () => {
        it('should generate deterministic signed plan with zero writes to destination', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                sourceEnvironment: {
                    projectId: apId(),
                },
                tables: [
                    {
                        name: 'Inventory',
                        externalId: 'ext-inventory-1',
                        fields: [
                            { name: 'sku', type: FieldType.TEXT },
                            { name: 'quantity', type: FieldType.NUMBER },
                        ],
                    },
                ],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: {
                    disabledTools: ['dangerous-tool'],
                },
                requiredPieces: [],
                requiredConnections: [],
            }

            // Record initial state
            const initialExport = await app!.inject({
                method: 'GET',
                url: `/api/v1/projects/${ctx.project.id}/replace/export`,
                headers: { authorization: `Bearer ${ctx.token}` },
            })
            const initialTablesCount = initialExport.json().tables.length

            // Plan call (dry-run)
            const planResponse = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })

            expect(planResponse.statusCode).toBe(StatusCodes.OK)
            const artifact: ProjectReplaceArtifact = planResponse.json()
            expect(artifact.plan.planId).toBeDefined()
            expect(artifact.plan.signature).toBeDefined()
            expect(artifact.plan.changes.creates.some((c) => c.kind === 'table' && c.name === 'Inventory')).toBe(true)
            expect(artifact.plan.changes.updates.some((u) => u.kind === 'mcp_server')).toBe(true)

            // Verify strictly ZERO writes occurred to destination
            const postExport = await app!.inject({
                method: 'GET',
                url: `/api/v1/projects/${ctx.project.id}/replace/export`,
                headers: { authorization: `Bearer ${ctx.token}` },
            })
            expect(postExport.json().tables.length).toBe(initialTablesCount)
        })

        it('should report preflight errors when referenced connections are missing', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                sourceEnvironment: {
                    projectId: apId(),
                },
                tables: [],
                triggerBindings: [
                    {
                        externalId: 'ext-tb-1',
                        pieceName: '@inboxfm-connect/piece-slack',
                        pieceVersion: '1.0.0',
                        triggerName: 'new_message',
                        promptTemplate: 'Handle {{message}}',
                        connectionExternalId: 'missing-conn-123',
                        settings: {},
                        propertySettings: null,
                        status: 'ENABLED',
                    },
                ],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [
                    {
                        externalId: 'missing-conn-123',
                        pieceName: '@inboxfm-connect/piece-slack',
                    },
                ],
            }

            const response = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })

            // Preflight error returns BAD_REQUEST (400) with artifact containing preflight error details
            expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
            const artifact: ProjectReplaceArtifact = response.json()
            expect(artifact.plan.preflight.passed).toBe(false)
            expect(artifact.plan.preflight.errors.length).toBeGreaterThan(0)
            expect(artifact.plan.preflight.errors.some((e) => e.message.includes('missing-conn-123'))).toBe(true)
        })
    })

    describe('Apply Plan', () => {
        it('should reject tampered plan signature with 400 Bad Request', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                sourceEnvironment: {
                    projectId: apId(),
                },
                tables: [{ name: 'Orders', externalId: 'ext-orders', fields: [] }],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            expect(planRes.statusCode).toBe(StatusCodes.OK)
            const artifact: ProjectReplaceArtifact = planRes.json()

            // Tamper signature
            const tamperedPlan = {
                ...artifact.plan,
                signature: 'a'.repeat(64), // invalid fake signature
            }

            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: tamperedPlan,
                    snapshot: artifact.snapshot,
                },
            })

            expect(applyRes.statusCode).toBe(StatusCodes.BAD_REQUEST)
        })

        it('should detect destination drift and fail with 409 Conflict', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                sourceEnvironment: {
                    projectId: apId(),
                },
                tables: [{ name: 'Products', externalId: 'ext-products', fields: [] }],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [],
            }

            // Create plan
            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            expect(planRes.statusCode).toBe(StatusCodes.OK)
            const artifact: ProjectReplaceArtifact = planRes.json()

            // Induce drift on destination (apply another plan with a different table)
            const driftSnapshot: ProjectStateSnapshot = {
                ...sourceSnapshot,
                tables: [{ name: 'DriftTable', externalId: 'ext-drift', fields: [] }],
            }
            const driftPlanRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: driftSnapshot,
            })
            await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: driftPlanRes.json().plan,
                    snapshot: driftPlanRes.json().snapshot,
                },
            })

            // Now apply the original plan, which was generated against previous destination state
            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                },
            })

            expect(applyRes.statusCode).toBe(StatusCodes.CONFLICT)
        })

        it('should successfully apply valid plan and converge state', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                sourceEnvironment: {
                    projectId: apId(),
                },
                tables: [
                    {
                        name: 'ConvergedTable',
                        externalId: 'ext-converged-table',
                        fields: [
                            { name: 'name', type: FieldType.TEXT },
                            { name: 'score', type: FieldType.NUMBER },
                        ],
                    },
                ],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: {
                    disabledTools: ['tool_alpha'],
                },
                requiredPieces: [],
                requiredConnections: [],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            expect(planRes.statusCode).toBe(StatusCodes.OK)
            const artifact: ProjectReplaceArtifact = planRes.json()

            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                },
            })

            expect(applyRes.statusCode).toBe(StatusCodes.OK)
            const result = applyRes.json()
            expect(result.applied.tablesCreated).toBe(1)
            expect(result.applied.mcpUpdated).toBe(1)
            expect(result.failed).toHaveLength(0)

            // Verify state in destination
            const verifyExport = await app!.inject({
                method: 'GET',
                url: `/api/v1/projects/${ctx.project.id}/replace/export`,
                headers: { authorization: `Bearer ${ctx.token}` },
            })
            const verifySnapshot: ProjectStateSnapshot = verifyExport.json()
            const createdTable = verifySnapshot.tables.find((t) => t.name === 'ConvergedTable')
            expect(createdTable).toBeDefined()
            expect(createdTable?.fields?.map((f) => f.name).sort()).toEqual(['name', 'score'])
            expect(verifySnapshot.mcp?.disabledTools).toContain('tool_alpha')
        })

        it('should reject apply when snapshot is swapped with a valid plan signature', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                sourceEnvironment: { projectId: apId() },
                tables: [{ name: 'TableA', externalId: 'ext-a', fields: [] }],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            expect(planRes.statusCode).toBe(StatusCodes.OK)
            const artifact: ProjectReplaceArtifact = planRes.json()

            // Swap snapshot with a different one
            const swappedSnapshot: ProjectStateSnapshot = {
                ...sourceSnapshot,
                tables: [{ name: 'TableB', externalId: 'ext-b', fields: [] }],
            }

            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: swappedSnapshot,
                },
            })

            expect(applyRes.statusCode).toBe(StatusCodes.BAD_REQUEST)
            expect(applyRes.json().message).toContain('Submitted snapshot checksum does not match plan checksum')
        })

        it('should reject cross-project plan replay against a different project', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                sourceEnvironment: { projectId: apId() },
                tables: [{ name: 'ProjectATable', externalId: 'ext-proj-a', fields: [] }],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [],
            }

            // Plan for Project 1 (ctx.project.id)
            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            expect(planRes.statusCode).toBe(StatusCodes.OK)
            const artifact: ProjectReplaceArtifact = planRes.json()

            // Try to replay plan against another project
            const otherCtx = await createTestContext(app!)
            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${otherCtx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${otherCtx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                },
            })

            expect(applyRes.statusCode).toBe(StatusCodes.BAD_REQUEST)
            expect(applyRes.json().message).toContain('Cross-project plan replay is forbidden')
        })

        it('should report VERSION_SKEW preflight error for invalid semver string instead of throwing 500', async () => {
            const invalidSemverSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: 'dev-unknown-version',
                exportedAt: new Date().toISOString(),
                sourceEnvironment: { projectId: apId() },
                tables: [],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: invalidSemverSnapshot,
            })

            // Should be 400 Bad Request with preflight error, NOT 500 internal server error
            expect(planRes.statusCode).toBe(StatusCodes.BAD_REQUEST)
            const artifact: ProjectReplaceArtifact = planRes.json()
            expect(artifact.plan.preflight.passed).toBe(false)
            expect(artifact.plan.preflight.errors.some((e) => e.kind === 'VERSION_SKEW')).toBe(true)
        })

        it('should detect drift when task timezone or trigger binding settings change', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                sourceEnvironment: { projectId: apId() },
                tables: [],
                triggerBindings: [],
                scheduledTasks: [
                    {
                        externalId: 'st-tz-test',
                        prompt: 'Daily digest',
                        cronExpression: '0 9 * * *',
                        timezone: 'UTC',
                        status: 'ENABLED',
                    },
                ],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [],
            }

            // Apply initially
            const planRes1 = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: planRes1.json().plan,
                    snapshot: planRes1.json().snapshot,
                },
            })

            // Generate plan for state with timezone UTC
            const planRes2 = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            const artifact2: ProjectReplaceArtifact = planRes2.json()

            // Update timezone directly on destination to America/New_York (induces drift)
            const { ScheduledTaskEntity } = await import('../../../../src/app/execution/scheduled-task/scheduled-task-entity')
            const { repoFactory } = await import('../../../../src/app/core/db/repo-factory')
            await repoFactory(ScheduledTaskEntity)().update({ projectId: ctx.project.id }, { timezone: 'America/New_York' })

            // Now apply artifact2 -> must fail with 409 CONFLICT due to timezone drift
            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact2.plan,
                    snapshot: artifact2.snapshot,
                },
            })

            expect(applyRes.statusCode).toBe(StatusCodes.CONFLICT)
        })

        it('should reject preflight when custom piece archive checksum is missing or mismatched', async () => {
            const crypto = await import('crypto')
            const dummyArchive = Buffer.from('test-package-payload-content').toString('base64')
            const correctChecksum = crypto.createHash('sha256').update(Buffer.from('test-package-payload-content')).digest('hex')

            // Test 1: Missing archiveChecksum
            const snapshotWithoutChecksum: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                customPieces: [{
                    name: '@custom/missing-checksum',
                    version: '1.0.0',
                    pieceType: 'CUSTOM',
                    packageType: 'ARCHIVE',
                    archiveFileBase64: dummyArchive,
                }],
                requiredConnections: [],
            }

            const planRes1 = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: snapshotWithoutChecksum,
            })
            expect(planRes1.statusCode).toBe(StatusCodes.BAD_REQUEST)
            const artifact1 = planRes1.json()
            expect(artifact1.plan.preflight.passed).toBe(false)
            expect(artifact1.plan.preflight.errors.some((e: any) => e.kind === 'CHECKSUM_MISMATCH')).toBe(true)

            // Test 2: Mismatched archiveChecksum
            const snapshotWithWrongChecksum: ProjectStateSnapshot = {
                ...snapshotWithoutChecksum,
                customPieces: [{
                    name: '@custom/bad-checksum',
                    version: '1.0.0',
                    pieceType: 'CUSTOM',
                    packageType: 'ARCHIVE',
                    archiveFileBase64: dummyArchive,
                    archiveChecksum: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
                }],
            }

            const planRes2 = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: snapshotWithWrongChecksum,
            })
            expect(planRes2.statusCode).toBe(StatusCodes.BAD_REQUEST)
            const artifact2 = planRes2.json()
            expect(artifact2.plan.preflight.passed).toBe(false)
            expect(artifact2.plan.preflight.errors.some((e: any) => e.kind === 'CHECKSUM_MISMATCH')).toBe(true)

            // Test 3: Valid archiveChecksum produces valid plan with deployable piece
            const snapshotWithValidChecksum: ProjectStateSnapshot = {
                ...snapshotWithoutChecksum,
                customPieces: [{
                    name: '@custom/valid-piece',
                    version: '1.0.0',
                    pieceType: 'CUSTOM',
                    packageType: 'ARCHIVE',
                    archiveFileBase64: dummyArchive,
                    archiveChecksum: correctChecksum,
                }],
            }

            const planRes3 = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: snapshotWithValidChecksum,
            })
            expect(planRes3.statusCode).toBe(StatusCodes.OK)
            const artifact3 = planRes3.json()
            expect(artifact3.plan.preflight.passed).toBe(true)
            expect(artifact3.plan.preflight.customIntegrations.deployable.length).toBe(1)
            expect(artifact3.plan.changes.creates.some((c: any) => c.kind === 'custom_piece' && c.name === '@custom/valid-piece@1.0.0')).toBe(true)
        })

        it('should block dependent trigger bindings when dependent custom piece install fails or is missing', async () => {
            // Snapshot with missing custom piece AND a trigger binding referencing it
            const snapshotWithDependent: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [{
                    externalId: 'tb-custom-dep',
                    pieceName: '@custom/missing-dep',
                    pieceVersion: '1.0.0',
                    triggerName: 'test_trigger',
                    promptTemplate: 'run when event fires',
                    settings: {},
                    status: 'ENABLED',
                }],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [{
                    name: '@custom/missing-dep',
                    version: '1.0.0',
                    pieceType: 'CUSTOM',
                }],
                customPieces: [{
                    name: '@custom/missing-dep',
                    version: '1.0.0',
                    pieceType: 'CUSTOM',
                }],
                requiredConnections: [],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: snapshotWithDependent,
            })
            expect(planRes.statusCode).toBe(StatusCodes.BAD_REQUEST)
            const artifact = planRes.json()
            expect(artifact.plan.preflight.passed).toBe(false)

            // When applying with force: true, trigger binding creation MUST be blocked
            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                    force: true,
                },
            })

            // Multi-status or response contains failure for the trigger binding
            expect([StatusCodes.OK, StatusCodes.MULTI_STATUS]).toContain(applyRes.statusCode)
            const result = applyRes.json()
            expect(result.applied.triggerBindingsCreated).toBe(0)
            const tbFailure = result.failed.find((f: any) => f.kind === 'trigger_binding')
            expect(tbFailure).toBeDefined()
            expect(tbFailure.error).toContain('Activation blocked: dependent custom integration')
        })

        it('should perform zero mutations when inspectOnly is true', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [{ name: 'InspectOnlyTable', externalId: 'ext-inspect', fields: [] }],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                customPieces: [],
                requiredConnections: [],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            const artifact = planRes.json()

            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                    inspectOnly: true,
                },
            })

            expect(applyRes.statusCode).toBe(StatusCodes.OK)
            const result = applyRes.json()
            expect(result.applied.tablesCreated).toBe(0)

            // Verify table was NOT actually created in destination
            const { TableEntity } = await import('../../../../src/app/tables/table/table.entity')
            const { repoFactory } = await import('../../../../src/app/core/db/repo-factory')
            const created = await repoFactory(TableEntity)().findOneBy({ projectId: ctx.project.id, externalId: 'ext-inspect' })
            expect(created).toBeNull()
        })

        it('should check compatibility for already installed custom pieces and reject with INCOMPATIBLE_INTEGRATION', async () => {
            const { pieceMetadataService } = await import('../../../../src/app/pieces/metadata/piece-metadata-service')
            const { createMockPieceMetadata } = await import('../../../helpers/mocks')
            await pieceMetadataService(app!.log).create({
                pieceMetadata: createMockPieceMetadata({
                    name: '@custom/installed-incompatible',
                    version: '1.0.0',
                    minimumSupportedRelease: '99.0.0',
                }),
                platformId: ctx.platform.id,
                packageType: PackageType.REGISTRY,
                pieceType: PieceType.CUSTOM,
            })

            const snapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                customPieces: [{
                    name: '@custom/installed-incompatible',
                    version: '1.0.0',
                    pieceType: 'CUSTOM',
                    minimumSupportedRelease: '99.0.0',
                }],
                requiredConnections: [],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: snapshot,
            })

            expect(planRes.statusCode).toBe(StatusCodes.BAD_REQUEST)
            const artifact = planRes.json()
            expect(artifact.plan.preflight.passed).toBe(false)
            expect(artifact.plan.preflight.errors.some((e: any) => e.kind === 'INCOMPATIBLE_INTEGRATION')).toBe(true)
            // Crucial: Incompatible piece must NOT be counted as unchanged!
            expect(artifact.plan.changes.unchanged.some((u: any) => u.externalId.includes('@custom/installed-incompatible'))).toBe(false)
        })

        it('should allow inspection via POST /inspect with READ_PROJECT permission and perform zero mutations', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [{ name: 'InspectEndpointTable', externalId: 'ext-inspect-ep', fields: [] }],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                customPieces: [],
                requiredConnections: [],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            const artifact = planRes.json()

            // Call dedicated /inspect endpoint
            const inspectRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/inspect`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                },
            })

            expect(inspectRes.statusCode).toBe(StatusCodes.OK)
            const result = inspectRes.json()
            expect(result.applied.tablesCreated).toBe(0)

            // Verify table was NOT actually created in destination
            const { TableEntity } = await import('../../../../src/app/tables/table/table.entity')
            const { repoFactory } = await import('../../../../src/app/core/db/repo-factory')
            const created = await repoFactory(TableEntity)().findOneBy({ projectId: ctx.project.id, externalId: 'ext-inspect-ep' })
            expect(created).toBeNull()
        })
    })

    describe('Connection Mapping, Bootstrap & Security (Issue #53)', () => {
        it('should report MISSING_CONNECTION with actionable preflight details and report', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [
                    {
                        externalId: 'tb-slack-unmatched',
                        pieceName: '@inboxfm-connect/piece-slack',
                        pieceVersion: '1.0.0',
                        triggerName: 'new_message',
                        promptTemplate: 'Handle message',
                        connectionExternalId: 'slack-unmatched-source',
                        settings: {},
                        propertySettings: null,
                        status: 'ENABLED',
                    },
                ],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [
                    {
                        externalId: 'slack-unmatched-source',
                        pieceName: '@inboxfm-connect/piece-slack',
                    },
                ],
            }

            const res = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })

            expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST)
            const artifact: ProjectReplaceArtifact = res.json()
            expect(artifact.plan.preflight.passed).toBe(false)
            expect(artifact.plan.preflight.errors.some((e) => e.kind === 'MISSING_CONNECTION')).toBe(true)

            const connPreflight = artifact.plan.preflight.connections
            expect(connPreflight).toBeDefined()
            expect(connPreflight?.required).toHaveLength(1)
            expect(connPreflight?.required[0].externalId).toBe('slack-unmatched-source')
            expect(connPreflight?.missing).toHaveLength(1)
            expect(connPreflight?.missing[0].externalId).toBe('slack-unmatched-source')
            expect(connPreflight?.missing[0].actionableHelp).toBeDefined()
            expect(connPreflight?.matched).toHaveLength(0)
            expect(connPreflight?.mapped).toHaveLength(0)
        })

        it('should report INCOMPATIBLE_CONNECTION in preflight when piece mismatch occurs', async () => {
            // Create a Square connection on destination
            await appConnectionService(app!.log).upsert({
                projectIds: [ctx.project.id],
                platformId: ctx.platform.id,
                externalId: 'conn-incompatible-check',
                displayName: 'Square Connection',
                pieceName: '@inboxfm-connect/piece-square',
                pieceVersion: '1.0.0',
                type: AppConnectionType.SECRET_TEXT,
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'square-key-123',
                },
                scope: AppConnectionScope.PROJECT,
                ownerId: null,
            })

            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [
                    {
                        externalId: 'conn-incompatible-check',
                        pieceName: '@inboxfm-connect/piece-slack', // Source expects Slack, destination has Square
                    },
                ],
            }

            const res = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })

            expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST)
            const artifact: ProjectReplaceArtifact = res.json()
            expect(artifact.plan.preflight.passed).toBe(false)
            expect(artifact.plan.preflight.errors.some((e) => e.kind === 'INCOMPATIBLE_CONNECTION')).toBe(true)
        })

        it('should remap source connection to existing destination connection', async () => {
            // Create target connection on destination
            await appConnectionService(app!.log).upsert({
                projectIds: [ctx.project.id],
                platformId: ctx.platform.id,
                externalId: 'dest-slack-existing',
                displayName: 'Production Slack',
                pieceName: '@inboxfm-connect/piece-slack',
                pieceVersion: '1.0.0',
                type: AppConnectionType.SECRET_TEXT,
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'xoxb-prod-token',
                },
                scope: AppConnectionScope.PROJECT,
                ownerId: null,
            })

            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [
                    {
                        externalId: 'tb-remapped-1',
                        pieceName: '@inboxfm-connect/piece-slack',
                        pieceVersion: '1.0.0',
                        triggerName: 'new_message',
                        promptTemplate: 'Handle Slack message',
                        connectionExternalId: 'staging-slack-conn',
                        settings: {},
                        propertySettings: null,
                        status: 'ENABLED',
                    },
                ],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [
                    {
                        externalId: 'staging-slack-conn',
                        pieceName: '@inboxfm-connect/piece-slack',
                    },
                ],
            }

            const connectionMappings: ConnectionMappingSchema[] = [
                {
                    sourceExternalId: 'staging-slack-conn',
                    destExternalId: 'dest-slack-existing',
                },
            ]

            // 1. Plan with connection mapping
            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    snapshot: sourceSnapshot,
                    connectionMappings,
                },
            })

            expect(planRes.statusCode).toBe(StatusCodes.OK)
            const artifact: ProjectReplaceArtifact = planRes.json()
            expect(artifact.plan.preflight.passed).toBe(true)

            const connPreflight = artifact.plan.preflight.connections
            expect(connPreflight?.matched).toHaveLength(1)
            expect(connPreflight?.matched[0].destExternalId).toBe('dest-slack-existing')
            expect(connPreflight?.mapped).toHaveLength(1)
            expect(connPreflight?.mapped[0].mappingType).toBe('REMAP')

            // 2. Apply with connection mapping
            vi.spyOn(userInteractionWatcher, 'submitAndWaitForResponse').mockResolvedValue({ output: [] } as never)
            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                    connectionMappings,
                },
            })

            expect(applyRes.statusCode).toBe(StatusCodes.OK)
            const applyResult = applyRes.json()
            expect(applyResult.applied.triggerBindingsCreated).toBe(1)
            expect(applyResult.applied.connectionsUnchanged).toBe(1)
            expect(applyResult.failed).toHaveLength(0)

            // Verify trigger binding was bound to dest-slack-existing
            const exportRes = await app!.inject({
                method: 'GET',
                url: `/api/v1/projects/${ctx.project.id}/replace/export`,
                headers: { authorization: `Bearer ${ctx.token}` },
            })
            const exp = exportRes.json()
            const tb = exp.triggerBindings.find((b: { pieceName: string, triggerName: string }) => b.pieceName === '@inboxfm-connect/piece-slack' && b.triggerName === 'new_message')
            expect(tb).toBeDefined()
            expect(tb.connectionExternalId).toBe('dest-slack-existing')
        })

        it('should bootstrap new destination connection with credentials and bind to triggers', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [
                    {
                        externalId: 'tb-bootstrap-1',
                        pieceName: '@inboxfm-connect/piece-slack',
                        pieceVersion: '1.0.0',
                        triggerName: 'new_message',
                        promptTemplate: 'Handle message',
                        connectionExternalId: 'source-slack-to-bootstrap',
                        settings: {},
                        propertySettings: null,
                        status: 'ENABLED',
                    },
                ],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [
                    {
                        externalId: 'source-slack-to-bootstrap',
                        pieceName: '@inboxfm-connect/piece-slack',
                    },
                ],
            }

            const connectionMappings: ConnectionMappingSchema[] = [
                {
                    sourceExternalId: 'source-slack-to-bootstrap',
                    destExternalId: 'dest-bootstrapped-slack',
                    pieceName: '@inboxfm-connect/piece-slack',
                    type: AppConnectionType.SECRET_TEXT,
                    value: {
                        secret_text: 'xoxb-ci-bootstrapped-token-456',
                    },
                    displayName: 'CI Bootstrapped Slack',
                },
            ]

            // 1. Plan with bootstrap mapping
            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    snapshot: sourceSnapshot,
                    connectionMappings,
                },
            })

            expect(planRes.statusCode).toBe(StatusCodes.OK)
            const artifact: ProjectReplaceArtifact = planRes.json()
            expect(artifact.plan.preflight.passed).toBe(true)

            const connPreflight = artifact.plan.preflight.connections
            expect(connPreflight?.mapped).toHaveLength(1)
            expect(connPreflight?.mapped[0].mappingType).toBe('BOOTSTRAP')
            expect(artifact.plan.changes.creates.some((c: any) => c.kind === 'connection' && c.externalId === 'dest-bootstrapped-slack')).toBe(true)

            // 2. Apply with bootstrap credentials
            vi.spyOn(userInteractionWatcher, 'submitAndWaitForResponse').mockResolvedValue({ output: [] } as never)
            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                    connectionMappings,
                },
            })

            expect(applyRes.statusCode).toBe(StatusCodes.OK)
            const applyResult = applyRes.json()
            expect(applyResult.applied.connectionsCreated).toBe(1)
            expect(applyResult.applied.triggerBindingsCreated).toBe(1)
            expect(applyResult.failed).toHaveLength(0)

            // 3. Verify convergence / idempotency on re-run
            const rerunPlanRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    snapshot: sourceSnapshot,
                    connectionMappings,
                },
            })
            expect(rerunPlanRes.statusCode).toBe(StatusCodes.OK)

            const rerunApplyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: rerunPlanRes.json().plan,
                    snapshot: rerunPlanRes.json().snapshot,
                    connectionMappings,
                },
            })

            expect(rerunApplyRes.statusCode).toBe(StatusCodes.OK)
            const rerunResult = rerunApplyRes.json()
            expect(rerunResult.applied.connectionsCreated).toBe(0)
            expect(rerunResult.applied.connectionsUpdated).toBe(1)
            expect(rerunResult.applied.triggerBindingsUnchanged).toBe(1)
        })

        it('should safely gate trigger bindings when required connection fails to resolve', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [
                    {
                        externalId: 'tb-gated-1',
                        pieceName: '@inboxfm-connect/piece-slack',
                        pieceVersion: '1.0.0',
                        triggerName: 'new_message',
                        promptTemplate: 'Handle message',
                        connectionExternalId: 'nonexistent-conn-1',
                        settings: {},
                        propertySettings: null,
                        status: 'ENABLED',
                    },
                ],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [
                    {
                        externalId: 'nonexistent-conn-1',
                        pieceName: '@inboxfm-connect/piece-slack',
                    },
                ],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            const artifact: ProjectReplaceArtifact = planRes.json()

            // Forced apply with unresolvable connection
            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                    force: true,
                },
            })

            expect(applyRes.statusCode).toBe(StatusCodes.MULTI_STATUS)
            const applyResult = applyRes.json()
            expect(applyResult.failed.some((f: { kind: string, error: string }) => f.kind === 'trigger_binding' && f.error.includes('Activation blocked'))).toBe(true)
            expect(applyResult.applied.triggerBindingsCreated).toBe(0)
        })

        it('should reject apply when connection mappings have been tampered or substituted (Finding 1)', async () => {
            await appConnectionService(app!.log).upsert({
                projectIds: [ctx.project.id],
                platformId: ctx.platform.id,
                externalId: 'dest-slack-approved',
                displayName: 'Approved Slack',
                pieceName: '@inboxfm-connect/piece-slack',
                pieceVersion: '1.0.0',
                type: AppConnectionType.SECRET_TEXT,
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'token-1',
                },
                scope: AppConnectionScope.PROJECT,
                ownerId: null,
            })

            await appConnectionService(app!.log).upsert({
                projectIds: [ctx.project.id],
                platformId: ctx.platform.id,
                externalId: 'dest-slack-substituted',
                displayName: 'Substituted Slack',
                pieceName: '@inboxfm-connect/piece-slack',
                pieceVersion: '1.0.0',
                type: AppConnectionType.SECRET_TEXT,
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'token-2',
                },
                scope: AppConnectionScope.PROJECT,
                ownerId: null,
            })

            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [{
                    externalId: 'source-slack-audit',
                    pieceName: '@inboxfm-connect/piece-slack',
                }],
            }

            const approvedMappings: ConnectionMappingSchema[] = [{
                sourceExternalId: 'source-slack-audit',
                destExternalId: 'dest-slack-approved',
            }]

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    snapshot: sourceSnapshot,
                    connectionMappings: approvedMappings,
                },
            })
            expect(planRes.statusCode).toBe(StatusCodes.OK)
            const artifact: ProjectReplaceArtifact = planRes.json()

            // Attempt apply with swapped mapping
            const swappedMappings: ConnectionMappingSchema[] = [{
                sourceExternalId: 'source-slack-audit',
                destExternalId: 'dest-slack-substituted',
            }]

            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                    connectionMappings: swappedMappings,
                },
            })

            expect(applyRes.statusCode).toBe(StatusCodes.BAD_REQUEST)
            expect(applyRes.json().message).toContain('Connection mappings supplied at apply time do not match the signed plan')
        })

        it('should revalidate direct connection matches for piece compatibility during apply and gate bindings even under --force (Finding 2)', async () => {
            // Destination connection has Square piece
            await appConnectionService(app!.log).upsert({
                projectIds: [ctx.project.id],
                platformId: ctx.platform.id,
                externalId: 'conn-direct-wrong-piece',
                displayName: 'Square Conn',
                pieceName: '@inboxfm-connect/piece-square',
                pieceVersion: '1.0.0',
                type: AppConnectionType.SECRET_TEXT,
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'square-key',
                },
                scope: AppConnectionScope.PROJECT,
                ownerId: null,
            })

            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [{
                    externalId: 'tb-slack-with-square-conn',
                    pieceName: '@inboxfm-connect/piece-slack',
                    pieceVersion: '1.0.0',
                    triggerName: 'new_message',
                    promptTemplate: 'handle',
                    connectionExternalId: 'conn-direct-wrong-piece',
                    settings: {},
                    status: 'ENABLED',
                }],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [{
                    externalId: 'conn-direct-wrong-piece',
                    pieceName: '@inboxfm-connect/piece-slack', // Source requires Slack!
                }],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            expect(planRes.statusCode).toBe(StatusCodes.BAD_REQUEST)
            const artifact: ProjectReplaceArtifact = planRes.json()

            // Applying with force: true MUST still revalidate piece compatibility at apply time!
            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                    force: true,
                },
            })

            expect(applyRes.statusCode).toBe(StatusCodes.MULTI_STATUS)
            const result = applyRes.json()
            expect(result.applied.triggerBindingsCreated).toBe(0)

            const connFailure = result.failed.find((f: any) => f.kind === 'connection' && f.externalId === 'conn-direct-wrong-piece')
            expect(connFailure).toBeDefined()
            expect(connFailure.error).toContain('Incompatible connection')

            const tbFailure = result.failed.find((f: any) => f.kind === 'trigger_binding' && f.externalId === 'tb-slack-with-square-conn')
            expect(tbFailure).toBeDefined()
            expect(tbFailure.error).toContain('Activation blocked')
        })

        it('should strictly scope connection lookups to target project and reject cross-project connection access (Finding 3)', async () => {
            // Create a completely separate project on the same platform
            const { createMockProject } = await import('../../../helpers/mocks')
            const { databaseConnection } = await import('../../../../src/app/database/database-connection')
            const otherProject = createMockProject({
                ownerId: ctx.user.id,
                platformId: ctx.platform.id,
            })
            await databaseConnection().getRepository('project').save(otherProject)

            await appConnectionService(app!.log).upsert({
                projectIds: [otherProject.id], // Belongs to other project only!
                platformId: ctx.platform.id,
                externalId: 'conn-in-other-project',
                displayName: 'Other Project Slack',
                pieceName: '@inboxfm-connect/piece-slack',
                pieceVersion: '1.0.0',
                type: AppConnectionType.SECRET_TEXT,
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'other-token',
                },
                scope: AppConnectionScope.PROJECT,
                ownerId: null,
            })

            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [{
                    externalId: 'conn-in-other-project',
                    pieceName: '@inboxfm-connect/piece-slack',
                }],
            }

            // Plan against ctx.project.id MUST report MISSING_CONNECTION because conn-in-other-project is not in ctx.project.id!
            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })

            expect(planRes.statusCode).toBe(StatusCodes.BAD_REQUEST)
            const artifact: ProjectReplaceArtifact = planRes.json()
            expect(artifact.plan.preflight.errors.some((e) => e.kind === 'MISSING_CONNECTION')).toBe(true)
            expect(artifact.plan.preflight.connections?.missing.some((m) => m.externalId === 'conn-in-other-project')).toBe(true)
        })

        it('should clear table status and trigger columns when source snapshot explicitly sets null (Finding 4)', async () => {
            const { TableEntity } = await import('../../../../src/app/tables/table/table.entity')
            const { repoFactory } = await import('../../../../src/app/core/db/repo-factory')
            const tableRepo = repoFactory(TableEntity)

            // Seed destination table with ENABLED status and ON_NEW_RECORD trigger
            const seededTable = await tableRepo().save({
                id: apId(),
                projectId: ctx.project.id,
                name: 'TableWithNullSync',
                externalId: 'ext-table-null-sync',
                status: TableAutomationStatus.ENABLED,
                trigger: TableAutomationTrigger.ON_NEW_RECORD,
            })
            expect(seededTable.status).toBe(TableAutomationStatus.ENABLED)
            expect(seededTable.trigger).toBe(TableAutomationTrigger.ON_NEW_RECORD)

            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [{
                    name: 'TableWithNullSync',
                    externalId: 'ext-table-null-sync',
                    status: null,
                    trigger: null,
                    fields: [],
                }],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            expect(planRes.statusCode).toBe(StatusCodes.OK)
            const artifact: ProjectReplaceArtifact = planRes.json()
            expect(artifact.plan.changes.updates.some((u: any) => u.kind === 'table' && u.externalId === 'ext-table-null-sync')).toBe(true)

            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                },
            })
            expect(applyRes.statusCode).toBe(StatusCodes.OK)

            // Re-fetch from DB and assert status and trigger were cleared to NULL
            const updatedTable = await tableRepo().findOneBy({ projectId: ctx.project.id, externalId: 'ext-table-null-sync' })
            expect(updatedTable).toBeDefined()
            expect(updatedTable?.status).toBeNull()
            expect(updatedTable?.trigger).toBeNull()
        })

        it('should reject tampered artifact signatures when using /inspect endpoint (Finding 5)', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            const artifact: ProjectReplaceArtifact = planRes.json()

            // Tamper with the plan signature
            const tamperedPlan = {
                ...artifact.plan,
                signature: 'deadbeef' + artifact.plan.signature.slice(8),
            }

            const inspectRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/inspect`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: tamperedPlan,
                    snapshot: artifact.snapshot,
                },
            })

            expect(inspectRes.statusCode).toBe(StatusCodes.BAD_REQUEST)
            expect(inspectRes.json().message).toContain('Plan signature verification failed')
        })

        it('should allow /inspect on a plan with failing preflight without throwing 400', async () => {
            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [{
                    externalId: 'conn-nonexistent',
                    pieceName: '@inboxfm-connect/piece-slack',
                }],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            expect(planRes.statusCode).toBe(StatusCodes.BAD_REQUEST)
            const artifact: ProjectReplaceArtifact = planRes.json()
            expect(artifact.plan.preflight.passed).toBe(false)

            const inspectRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/inspect`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                },
            })

            expect(inspectRes.statusCode).toBe(StatusCodes.OK)
            const inspectResult = inspectRes.json()
            expect(inspectResult.applied.tablesCreated).toBe(0)
            expect(inspectResult.failed.length).toBe(0)
        })

        it('should reject non-platform-admin applying plan with deployCustomIntegrations', async () => {
            const { createMockProjectMember, createMockProjectRole, mockBasicUser } = await import('../../../helpers/mocks')
            const { Permission, PlatformRole, DefaultProjectRole, RoleType, PrincipalType } = await import('@inboxfm-connect/shared')
            const { databaseConnection } = await import('../../../../src/app/database/database-connection')

            // Create a non-admin member on ctx.platform.id
            const { mockUser: nonAdminUser } = await mockBasicUser({
                user: { platformId: ctx.platform.id, platformRole: PlatformRole.MEMBER, externalId: 'ext-non-admin' },
            })
            await databaseConnection().getRepository('user').save(nonAdminUser)

            const role = createMockProjectRole({
                platformId: ctx.platform.id,
                type: RoleType.DEFAULT,
                name: DefaultProjectRole.ADMIN,
                permissions: [Permission.WRITE_PROJECT, Permission.READ_PROJECT],
            })
            await databaseConnection().getRepository('project_role').save(role)

            const membership = createMockProjectMember({
                platformId: ctx.platform.id,
                projectId: ctx.project.id,
                userId: nonAdminUser.id,
                projectRoleId: role.id,
            })
            await databaseConnection().getRepository('project_member').save(membership)

            const { generateMockToken } = await import('../../../helpers/auth')
            const nonAdminToken = await generateMockToken({
                id: nonAdminUser.id,
                type: PrincipalType.USER,
                projectId: ctx.project.id,
                platform: { id: ctx.platform.id },
            })

            const sourceSnapshot: ProjectStateSnapshot = {
                schemaVersion: 1,
                sourceActivepiecesVersion: '0.120.0',
                exportedAt: new Date().toISOString(),
                tables: [],
                triggerBindings: [],
                scheduledTasks: [],
                mcp: { disabledTools: [] },
                requiredPieces: [],
                requiredConnections: [],
            }

            const planRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/plan`,
                headers: { authorization: `Bearer ${ctx.token}` },
                body: sourceSnapshot,
            })
            const artifact: ProjectReplaceArtifact = planRes.json()

            const applyRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/projects/${ctx.project.id}/replace/apply`,
                headers: { authorization: `Bearer ${nonAdminToken}` },
                body: {
                    plan: artifact.plan,
                    snapshot: artifact.snapshot,
                    deployCustomIntegrations: true,
                },
            })

            expect(applyRes.statusCode).toBe(StatusCodes.FORBIDDEN)
        })
    })
})
