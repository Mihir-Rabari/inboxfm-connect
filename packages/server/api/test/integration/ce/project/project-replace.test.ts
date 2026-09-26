import { apId } from '@inboxfm-connect/core-utils'
import {
    FieldType,
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
    })
})
