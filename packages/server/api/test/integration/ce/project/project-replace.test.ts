import { apId } from '@inboxfm-connect/core-utils'
import {
    FieldType,
    PackageType,
    PieceType,
    ProjectReplaceArtifact,
    ProjectStateSnapshot,
} from '@inboxfm-connect/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
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
})
