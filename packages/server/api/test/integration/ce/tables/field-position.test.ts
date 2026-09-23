import { FieldType } from '@inboxfm-connect/shared'
import { FastifyInstance } from 'fastify'
import { fieldService } from '../../../../src/app/tables/field/field.service'
import { tableService } from '../../../../src/app/tables/table/table.service'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

/**
 * These exercise `fieldService` directly rather than through `ctx.post('/v1/fields', ...)`.
 * `tablesModule` (the `/v1/tables`, `/v1/fields`, `/v1/records` REST surface) is currently
 * commented out in app.ts - see the SUSPENDED note atop field.test.ts - so the HTTP layer
 * for this feature is unreachable right now, while the field entity/service stay live
 * (the MCP table tools call `fieldService` directly). Testing the service with a real
 * Postgres connection is what is actually reachable, and it is also what proves the
 * locking/transaction strategy: a real DB is required to prove the concurrent-reorder
 * race is handled correctly, a mocked repo could not show that.
 */

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function createTableWithFields(projectId: string, count: number) {
    const table = await tableService.create({
        projectId,
        request: {
            projectId,
            name: 'positions-table',
        },
    })
    const fields = []
    for (let i = 0; i < count; i++) {
        const field = await fieldService.create({
            projectId,
            request: {
                name: `field-${i}`,
                type: FieldType.TEXT,
                tableId: table.id,
            },
        })
        fields.push(field)
    }
    return { table, fields }
}

describe('Field position ordering', () => {
    describe('tenant isolation', () => {
        it('should not let one project reorder another project\'s field', async () => {
            const ctxA = await createTestContext(app!)
            const ctxB = await createTestContext(app!)
            const { fields } = await createTableWithFields(ctxA.project.id, 2)

            await expect(fieldService.update({
                id: fields[0].id,
                projectId: ctxB.project.id,
                request: { position: 1 },
            })).rejects.toThrow()

            const untouched = await fieldService.getAll({ projectId: ctxA.project.id, tableId: fields[0].tableId })
            expect(untouched.map(f => f.position)).toEqual([0, 1])
        })

        it('should not let one project delete another project\'s field', async () => {
            const ctxA = await createTestContext(app!)
            const ctxB = await createTestContext(app!)
            const { table, fields } = await createTableWithFields(ctxA.project.id, 2)

            await fieldService.delete({ id: fields[0].id, projectId: ctxB.project.id })

            const stillThere = await fieldService.getAll({ projectId: ctxA.project.id, tableId: table.id })
            expect(stillThere).toHaveLength(2)
        })

        it('should scope getAll strictly to the requesting project', async () => {
            const ctxA = await createTestContext(app!)
            const ctxB = await createTestContext(app!)
            const { table } = await createTableWithFields(ctxA.project.id, 2)

            const fromOtherProject = await fieldService.getAll({ projectId: ctxB.project.id, tableId: table.id })
            expect(fromOtherProject).toHaveLength(0)
        })
    })

    describe('create (append and insert-between)', () => {
        it('should append a new field at the end by default', async () => {
            const ctx = await createTestContext(app!)
            const { table } = await createTableWithFields(ctx.project.id, 2)

            const appended = await fieldService.create({
                projectId: ctx.project.id,
                request: { name: 'appended', type: FieldType.TEXT, tableId: table.id },
            })

            expect(appended.position).toBe(2)
            const all = await fieldService.getAll({ projectId: ctx.project.id, tableId: table.id })
            expect(all.map(f => f.position)).toEqual([0, 1, 2])
        })

        it('should insert a field between two existing fields and shift the rest', async () => {
            const ctx = await createTestContext(app!)
            const { table, fields } = await createTableWithFields(ctx.project.id, 3)

            const inserted = await fieldService.create({
                projectId: ctx.project.id,
                request: { name: 'inserted', type: FieldType.TEXT, tableId: table.id, position: 1 },
            })

            expect(inserted.position).toBe(1)
            const all = await fieldService.getAll({ projectId: ctx.project.id, tableId: table.id })
            expect(all.map(f => f.id)).toEqual([fields[0].id, inserted.id, fields[1].id, fields[2].id])
            expect(all.map(f => f.position)).toEqual([0, 1, 2, 3])
        })
    })

    describe('delete (gap closing)', () => {
        it('should close the gap after deleting a field from the middle', async () => {
            const ctx = await createTestContext(app!)
            const { table, fields } = await createTableWithFields(ctx.project.id, 3)

            await fieldService.delete({ id: fields[1].id, projectId: ctx.project.id })

            const remaining = await fieldService.getAll({ projectId: ctx.project.id, tableId: table.id })
            expect(remaining.map(f => f.id)).toEqual([fields[0].id, fields[2].id])
            expect(remaining.map(f => f.position)).toEqual([0, 1])
        })

        it('should be a no-op when deleting a field that no longer exists', async () => {
            const ctx = await createTestContext(app!)
            const { table, fields } = await createTableWithFields(ctx.project.id, 2)

            await fieldService.delete({ id: fields[0].id, projectId: ctx.project.id })
            await expect(fieldService.delete({ id: fields[0].id, projectId: ctx.project.id })).resolves.toBeUndefined()

            const remaining = await fieldService.getAll({ projectId: ctx.project.id, tableId: table.id })
            expect(remaining).toHaveLength(1)
        })
    })

    describe('reorder', () => {
        it('should move a field later and shift the fields in between back', async () => {
            const ctx = await createTestContext(app!)
            const { table, fields } = await createTableWithFields(ctx.project.id, 4)

            await fieldService.update({ id: fields[0].id, projectId: ctx.project.id, request: { position: 2 } })

            const all = await fieldService.getAll({ projectId: ctx.project.id, tableId: table.id })
            expect(all.map(f => f.id)).toEqual([fields[1].id, fields[2].id, fields[0].id, fields[3].id])
            expect(all.map(f => f.position)).toEqual([0, 1, 2, 3])
        })

        it('should move a field earlier and shift the fields in between forward', async () => {
            const ctx = await createTestContext(app!)
            const { table, fields } = await createTableWithFields(ctx.project.id, 4)

            await fieldService.update({ id: fields[3].id, projectId: ctx.project.id, request: { position: 1 } })

            const all = await fieldService.getAll({ projectId: ctx.project.id, tableId: table.id })
            expect(all.map(f => f.id)).toEqual([fields[0].id, fields[3].id, fields[1].id, fields[2].id])
            expect(all.map(f => f.position)).toEqual([0, 1, 2, 3])
        })

        it('should clamp an out-of-range position to the last valid slot', async () => {
            const ctx = await createTestContext(app!)
            const { table, fields } = await createTableWithFields(ctx.project.id, 3)

            await fieldService.update({ id: fields[0].id, projectId: ctx.project.id, request: { position: 999 } })

            const all = await fieldService.getAll({ projectId: ctx.project.id, tableId: table.id })
            expect(all.map(f => f.id)).toEqual([fields[1].id, fields[2].id, fields[0].id])
        })

        it('should rename without touching position when position is omitted', async () => {
            const ctx = await createTestContext(app!)
            const { fields } = await createTableWithFields(ctx.project.id, 2)

            const renamed = await fieldService.update({ id: fields[0].id, projectId: ctx.project.id, request: { name: 'renamed' } })

            expect(renamed.name).toBe('renamed')
            expect(renamed.position).toBe(0)
        })
    })

    describe('concurrent-reorder race', () => {
        it('should not corrupt or duplicate positions under two simultaneous reorders on the same table', async () => {
            const ctx = await createTestContext(app!)
            const { table, fields } = await createTableWithFields(ctx.project.id, 5)

            // Two conflicting reorders fired at the same time on the same table: one moves
            // the first field to the end, the other moves the last field to the front. If
            // the locking/transaction strategy is broken, this either throws a unique
            // constraint violation that should never surface (the lock should have
            // serialized these), or - worse - silently leaves duplicate/missing positions.
            await Promise.all([
                fieldService.update({ id: fields[0].id, projectId: ctx.project.id, request: { position: 4 } }),
                fieldService.update({ id: fields[4].id, projectId: ctx.project.id, request: { position: 0 } }),
            ])

            const all = await fieldService.getAll({ projectId: ctx.project.id, tableId: table.id })
            expect(all).toHaveLength(5)
            expect(all.map(f => f.position)).toEqual([0, 1, 2, 3, 4])
            expect(new Set(all.map(f => f.id)).size).toBe(5)
        })

        it('should not corrupt or duplicate positions under many concurrent creates on the same table', async () => {
            const ctx = await createTestContext(app!)
            const table = await tableService.create({
                projectId: ctx.project.id,
                request: { projectId: ctx.project.id, name: 'concurrent-create-table' },
            })

            await Promise.all(Array.from({ length: 8 }, (_, i) =>
                fieldService.create({
                    projectId: ctx.project.id,
                    request: { name: `concurrent-${i}`, type: FieldType.TEXT, tableId: table.id },
                }),
            ))

            const all = await fieldService.getAll({ projectId: ctx.project.id, tableId: table.id })
            expect(all).toHaveLength(8)
            expect(all.map(f => f.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
            expect(new Set(all.map(f => f.id)).size).toBe(8)
        })

        it('should not corrupt positions under a concurrent reorder and delete on the same table', async () => {
            const ctx = await createTestContext(app!)
            const { table, fields } = await createTableWithFields(ctx.project.id, 5)

            await Promise.all([
                fieldService.update({ id: fields[0].id, projectId: ctx.project.id, request: { position: 3 } }),
                fieldService.delete({ id: fields[4].id, projectId: ctx.project.id }),
            ])

            const all = await fieldService.getAll({ projectId: ctx.project.id, tableId: table.id })
            expect(all).toHaveLength(4)
            expect(all.map(f => f.position)).toEqual([0, 1, 2, 3])
            expect(new Set(all.map(f => f.id)).size).toBe(4)
        })
    })
})
