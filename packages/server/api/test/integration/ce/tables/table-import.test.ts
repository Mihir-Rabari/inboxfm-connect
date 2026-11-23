import { ActivepiecesError, ErrorCode } from '@inboxfm-connect/core-utils'
import { FieldType, TableImportFormat } from '@inboxfm-connect/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { EntityManager } from 'typeorm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { tableImportService } from '../../../../src/app/tables/table/table-import.service'
import { db } from '../../../helpers/db'
import {
    createMockField,
    createMockTable,
} from '../../../helpers/mocks'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

const silentLogger: FastifyBaseLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    silent: vi.fn(),
    child: () => silentLogger,
    level: 'silent',
}

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Table Import Service (Integration)', () => {
    it('imports CSV data into existing fields', async () => {
        const ctx = await createTestContext(app!)
        const table = createMockTable({ projectId: ctx.project.id })
        await db.save('table', table)

        const nameField = createMockField({ tableId: table.id, projectId: ctx.project.id })
        nameField.name = 'Full Name'
        nameField.type = FieldType.TEXT
        nameField.position = 0
        await db.save('field', nameField)

        const ageField = createMockField({ tableId: table.id, projectId: ctx.project.id })
        ageField.name = 'Age'
        ageField.type = FieldType.NUMBER
        ageField.position = 1
        await db.save('field', ageField)

        const csvData = 'Full Name,Age\n"Alice Smith",28\n"Bob Jones",35'

        const result = await tableImportService.importData({
            projectId: ctx.project.id,
            tableId: table.id,
            request: {
                format: TableImportFormat.CSV,
                csvData,
            },
            logger: silentLogger,
        })

        expect(result.totalRows).toBe(2)
        expect(result.importedRecords).toBe(2)
        expect(result.createdFields).toEqual([])

        const records = await db.findManyBy('record', { tableId: table.id, projectId: ctx.project.id })
        expect(records.length).toBe(2)

        const cells = await db.findManyBy<{ value: string }>('cell', { projectId: ctx.project.id })
        expect(cells.length).toBe(4)
        expect(cells.some((c) => c.value === 'Alice Smith')).toBe(true)
        expect(cells.some((c) => c.value === '28')).toBe(true)
    })

    it('auto-creates missing fields with inferred types when autoCreateFields is true', async () => {
        const ctx = await createTestContext(app!)
        const table = createMockTable({ projectId: ctx.project.id })
        await db.save('table', table)

        const result = await tableImportService.importData({
            projectId: ctx.project.id,
            tableId: table.id,
            request: {
                format: TableImportFormat.JSON,
                jsonData: [
                    { Title: 'Task A', Priority: 1, CreatedDate: '2026-10-04' },
                    { Title: 'Task B', Priority: 2, CreatedDate: '2026-10-05' },
                ],
                autoCreateFields: true,
            },
            logger: silentLogger,
        })

        expect(result.totalRows).toBe(2)
        expect(result.importedRecords).toBe(2)
        expect(result.createdFields.length).toBe(3)

        const titleField = result.createdFields.find((f) => f.name === 'Title')
        expect(titleField?.type).toBe(FieldType.TEXT)

        const priorityField = result.createdFields.find((f) => f.name === 'Priority')
        expect(priorityField?.type).toBe(FieldType.NUMBER)

        const dateField = result.createdFields.find((f) => f.name === 'CreatedDate')
        expect(dateField?.type).toBe(FieldType.DATE)

        const records = await db.findManyBy('record', { tableId: table.id, projectId: ctx.project.id })
        expect(records.length).toBe(2)

        const cells = await db.findManyBy('cell', { projectId: ctx.project.id })
        expect(cells.length).toBe(6)
    })

    it('rejects unknown column headers when autoCreateFields is false', async () => {
        const ctx = await createTestContext(app!)
        const table = createMockTable({ projectId: ctx.project.id })
        await db.save('table', table)

        let caughtError: unknown
        try {
            await tableImportService.importData({
                projectId: ctx.project.id,
                tableId: table.id,
                request: {
                    format: TableImportFormat.JSON,
                    jsonData: [
                        { UnknownField: 'Some value' },
                    ],
                    autoCreateFields: false,
                },
                logger: silentLogger,
            })
        }
        catch (err) {
            caughtError = err
        }

        expect(caughtError).toBeInstanceOf(ActivepiecesError)
        const apError = caughtError as ActivepiecesError
        expect(apError.error.code).toBe(ErrorCode.VALIDATION)
        expect(apError.error.params?.message).toContain('Unknown column header(s): "UnknownField"')
    })

    it('rejects cross-project table import attempt', async () => {
        const ctx = await createTestContext(app!)
        const otherCtx = await createTestContext(app!)

        const otherTable = createMockTable({ projectId: otherCtx.project.id })
        await db.save('table', otherTable)

        let caughtError: unknown
        try {
            await tableImportService.importData({
                projectId: ctx.project.id,
                tableId: otherTable.id,
                request: {
                    format: TableImportFormat.JSON,
                    jsonData: [{ Name: 'Test' }],
                },
                logger: silentLogger,
            })
        }
        catch (err) {
            caughtError = err
        }

        expect(caughtError).toBeInstanceOf(ActivepiecesError)
        const apError = caughtError as ActivepiecesError
        expect(apError.error.code).toBe(ErrorCode.ENTITY_NOT_FOUND)
    })

    it('rejects import when row count exceeds MAX_IMPORT_ROWS (500)', async () => {
        const ctx = await createTestContext(app!)
        const table = createMockTable({ projectId: ctx.project.id })
        await db.save('table', table)

        const rows = Array.from({ length: 501 }, (_, i) => ({ Name: `User ${i}` }))

        let caughtError: unknown
        try {
            await tableImportService.importData({
                projectId: ctx.project.id,
                tableId: table.id,
                request: {
                    format: TableImportFormat.JSON,
                    jsonData: rows,
                },
                logger: silentLogger,
            })
        }
        catch (err) {
            caughtError = err
        }

        expect(caughtError).toBeInstanceOf(ActivepiecesError)
        const apError = caughtError as ActivepiecesError
        expect(apError.error.code).toBe(ErrorCode.VALIDATION)
        expect(apError.error.params?.message).toContain('Import exceeds maximum allowed rows of 500')
    })

    it('rolls back auto-created fields if insertion transaction fails', async () => {
        const ctx = await createTestContext(app!)
        const table = createMockTable({ projectId: ctx.project.id })
        await db.save('table', table)

        const insertSpy = vi.spyOn(EntityManager.prototype, 'insert').mockRejectedValueOnce(new Error('Simulated DB failure'))

        let caughtError: unknown
        try {
            await tableImportService.importData({
                projectId: ctx.project.id,
                tableId: table.id,
                request: {
                    format: TableImportFormat.JSON,
                    jsonData: [
                        { UniqueColumnToRollback: 'Val' },
                    ],
                    autoCreateFields: true,
                },
                logger: silentLogger,
            })
        }
        catch (err) {
            caughtError = err
        }

        insertSpy.mockRestore()
        expect(caughtError).toBeDefined()

        const fields = await db.findManyBy('field', { tableId: table.id, projectId: ctx.project.id })
        expect(fields.length).toBe(0)

        const records = await db.findManyBy('record', { tableId: table.id, projectId: ctx.project.id })
        expect(records.length).toBe(0)
    })

    it('handles empty dataset gracefully without errors', async () => {
        const ctx = await createTestContext(app!)
        const table = createMockTable({ projectId: ctx.project.id })
        await db.save('table', table)

        const result = await tableImportService.importData({
            projectId: ctx.project.id,
            tableId: table.id,
            request: {
                format: TableImportFormat.JSON,
                jsonData: [],
            },
            logger: silentLogger,
        })

        expect(result.totalRows).toBe(0)
        expect(result.importedRecords).toBe(0)
        expect(result.createdFields).toEqual([])
    })
})
