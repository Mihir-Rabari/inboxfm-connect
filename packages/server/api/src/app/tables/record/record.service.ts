import { ActivepiecesError, apId, chunk, Cursor, ErrorCode, isNil, SeekPage } from '@inboxfm-connect/core-utils'
import { Cell, CreateRecordsRequest, Field, Filter, FilterOperator, PopulatedRecord, TableWebhookEventType, UpdateRecordRequest } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { EntityManager, In, MoreThan } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { transaction } from '../../core/db/transaction'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { FieldEntity } from '../field/field.entity'
import { fieldService } from '../field/field.service'
import { CellEntity } from './cell.entity'
import { RecordEntity, RecordSchema } from './record.entity'

const MAX_BATCH_SIZE = 50
const MAX_PAGE_SIZE = 500
const DEFAULT_PAGE_SIZE = 10

const recordRepo = repoFactory(RecordEntity)

function decodeCursor(cursor: Cursor): { created: string; id: string } | null {
    if (!cursor) return null
    try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8')
        const [created, id] = decoded.split(':')
        if (!created || !id) return null
        return { created, id }
    } catch {
        return null
    }
}

function encodeCursor(created: string, id: string): Cursor {
    return Buffer.from(`${created}:${id}`).toString('base64')
}

const cellsRepo = repoFactory(CellEntity)

export const recordService = {
    async create({
        request,
        projectId,
        fields,
    }: CreateParams): Promise<PopulatedRecord[]> {
        await this.validateCount({ projectId, tableId: request.tableId }, request.records.length)
        const existingFields = fields ?? await fieldService.getAll({
            tableId: request.tableId,
            projectId,
        })

        const validRecords = request.records.map((recordData) =>
            recordData.filter((cellData) =>
                existingFields.some((field) => field.id === cellData.fieldId),
            ),
        )

        let insertedRecordIds: string[] = []
        insertedRecordIds = await transaction(async (entityManager: EntityManager) => {
            const batches = chunk(validRecords, MAX_BATCH_SIZE)
            const records: RecordSchema[] = []
            const insertedRecordIds: string[] = []

            for (const batch of batches) {
                const now = new Date(new Date().getTime() + records.length)
                const recordInsertions = prepareRecordInsertions(batch, request.tableId, projectId, now)

                await entityManager.getRepository(RecordEntity).insert(recordInsertions)

                const cellInsertions = prepareCellInsertions(batch, recordInsertions, projectId)
                await entityManager.getRepository(CellEntity).insert(cellInsertions)

                insertedRecordIds.push(...recordInsertions.map((r) => r.id))
            }

            return insertedRecordIds
        })

        const insertedRecords = await recordRepo().find({
            where: { id: In(insertedRecordIds), tableId: request.tableId, projectId },
            relations: ['cells'],
            order: {
                created: 'ASC',
            },
        })
        return formatRecordsAndFetchField({ records: insertedRecords, tableId: request.tableId, projectId, fields: existingFields })
    },

    async list({
        tableId,
        projectId,
        cursorRequest,
        limit,
        filters,
        fields: prefetchedFields,
    }: ListParams): Promise<SeekPage<PopulatedRecord>> {
        const clampedLimit = Math.min(Math.max(1, limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
        
        const fields = prefetchedFields ?? await fieldService.getAll({
            tableId,
            projectId,
        })

        // Build the base query conditions
        const whereBase: Record<string, any> = {
            projectId,
            tableId,
        }

        // Decode cursor for pagination
        const cursor = decodeCursor(cursorRequest)
        
        // Build the query with cursor-based pagination
        let where = { ...whereBase }
        if (cursor) {
            where = {
                ...whereBase,
                created: MoreThan(cursor.created),
                id: MoreThan(cursor.id),
            }
        }

        // Fetch one extra record to determine if there's a next page
        const records = await recordRepo().find({
            where,
            order: {
                created: 'ASC',
                id: 'ASC',
            },
            take: clampedLimit + 1,
        })

        // Determine if there's a next page
        const hasNextPage = records.length > clampedLimit
        const pagedRecords = hasNextPage ? records.slice(0, clampedLimit) : records

        // Extract record IDs for cell fetching
        const recordIds = pagedRecords.map((r) => r.id)

        // Fetch cells only for the paged records
        let cellsByRecordId = new Map<string, Cell[]>()
        if (recordIds.length > 0) {
            const cells = await cellsRepo().find({
                where: {
                    projectId,
                    fieldId: In(fields.map((field) => field.id)),
                    recordId: In(recordIds),
                },
            })
            const cellsByRecordIdMap = new Map<string, Cell[]>()
            for (const cell of cells) {
                const group = cellsByRecordIdMap.get(cell.recordId)
                if (group) {
                    group.push(cell)
                } else {
                    cellsByRecordIdMap.set(cell.recordId, [cell])
                }
            }
            cellsByRecordId = cellsByRecordIdMap
        }

        // Attach cells to records
        const recordsWithCells = records.map((record) => ({
            ...record,
            cells: cellsByRecordId.get(record.id) ?? [],
        }))

        // Apply filters if present
        const filteredRecords = filters && filters.length > 0
            ? records.filter((record) => {
                if (!filters || filters.length === 0) return true
                return filters.every((filter) => {
                    const cell = record.cells.find(c => c.fieldId === filter.fieldId)
                        ?? { fieldId: filter.fieldId, value: '' }
                    return doesCellValueMatchFilters(cell, [filter])
                })
            })
            : records

        // Apply limit after filtering (in-memory filtering may reduce count)
        const finalRecords = filteredRecords.slice(0, clampedLimit)

        const populatedRecords = await formatRecordsAndFetchField({ records: finalRecords, tableId, projectId, fields })

        // Determine next cursor
        const nextCursor = hasNextPage && pagedRecords.length > 0
            ? encodeCursor(pagedRecords[pagedRecords.length - 1].created, pagedRecords[pagedRecords.length - 1].id)
            : null

        // Determine previous cursor (for reverse pagination)
        const previousCursor = cursorRequest ? encodeCursor(records[0].created, records[0].id) : null

        return {
            data: populatedRecords.slice(0, clampedLimit),
            next: nextCursor,
            previous: previousCursor,
        }
    },

    async getById({
        id,
        projectId,
    }: GetByIdParams): Promise<PopulatedRecord> {
        const record = await recordRepo().findOne({
            where: { id, projectId },
            relations: ['cells'],
        })

        if (isNil(record)) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    message: `Record ${id} not found`,
                },
            })
        }

        const result = await formatRecordsAndFetchField({ records: [record], tableId: record.tableId, projectId: record.projectId })
        return result[0]
    },

    async update({
        id,
        projectId,
        request,
    }: UpdateParams): Promise<PopulatedRecord> {
        const { tableId } = request
        return transaction(async (entityManager: EntityManager) => {
            const record = await entityManager.getRepository(RecordEntity).findOne({
                where: { projectId, tableId, id },
            })

            if (isNil(record)) {
                throw new ActivepiecesError({
                    code: ErrorCode.ENTITY_NOT_FOUND,
                    params: {
                        entityType: 'Record',
                        entityId: id,
                    },
                })
            }

            if (request.cells && request.cells.length > 0) {
                const existingFields = await entityManager
                    .getRepository(FieldEntity)
                    .find({
                        where: { projectId, tableId },
                    })
            
                // Filter out cells with non-existing fields
                const validCells = request.cells.filter((cellData) =>
                    existingFields.some((field) => field.id === cellData.fieldId),
                )

                // Prepare cells for upsert
                const cellsToUpsert = validCells.map((cellData) => {
                    return {
                        recordId: id,
                        fieldId: cellData.fieldId,
                        projectId,
                        value: cellData.value ?? '',
                        id: apId(),
                    }
                })

                // Perform bulk upsert only for valid cells
                if (cellsToUpsert.length > 0) {
                    await entityManager
                        .getRepository(CellEntity)
                        .upsert(cellsToUpsert, ['projectId', 'fieldId', 'recordId'])
                }
            }

            // Fetch and return the updated record with full details
            const updatedRecord = await entityManager
                .getRepository(RecordEntity)
                .findOne({
                    where: { id, projectId, tableId },
                    relations: ['cells'],
                })

            if (isNil(updatedRecord)) {
                throw new ActivepiecesError({
                    code: ErrorCode.ENTITY_NOT_FOUND,
                    params: {
                        entityType: 'Record',
                        entityId: id,
                    },
                })
            }

            const result = await formatRecordsAndFetchField({ records: [updatedRecord], tableId: updatedRecord.tableId, projectId: updatedRecord.projectId })
            return result[0]
        })
    },

    async delete({
        ids,
        projectId,
    }: DeleteParams): Promise<PopulatedRecord[]> {
        const firstRecord = await recordRepo().findOne({
            where: { id: ids[0], projectId },
            select: ['tableId'],
        })
        if (isNil(firstRecord)) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'Record',
                    entityId: ids[0],
                },
            })
        }

        const records = await recordRepo().find({
            where: { id: In(ids), projectId, tableId: firstRecord.tableId },
            relations: ['cells'],
        })

        await recordRepo().delete({
            id: In(ids),
            projectId,
            tableId: firstRecord.tableId,
        })

        if (records.length === 0) {
            return []
        }

        return formatRecordsAndFetchField({ records, tableId: firstRecord.tableId, projectId })
    },

    async deleteAll({
        tableId,
        projectId,
    }: DeleteAllParams): Promise<PopulatedRecord[]> {
        const deletedRecords = await transaction(async (entityManager: EntityManager) => {
            const records = await entityManager.getRepository(RecordEntity).find({
                where: { projectId, tableId },
                relations: ['cells'],
            })

            const recordIds = records.map((record) => record.id)

            if (recordIds.length > 0) {
                await entityManager.getRepository(RecordEntity).delete({
                    id: In(recordIds),
                    projectId,
                    tableId,
                })
            }

            return records
        })

        if (deletedRecords.length === 0) {
            return []
        }

        return formatRecordsAndFetchField({ records: deletedRecords, tableId, projectId })
    },

    async triggerWebhooks({
        projectId: _projectId,
        tableId: _tableId,
        eventType: _eventType,
        data: _data,
        logger: _logger,
        authorization: _authorization,
    }: TriggerWebhooksParams): Promise<void> {
        // No-op: Flow table webhooks are deprecated in headless platform.
    },

    async count({ projectId, tableId }: CountParams): Promise<number> {
        return recordRepo().count({
            where: { projectId, tableId },
        })
    },

    async validateCount(params: CountParams, insertCount: number): Promise<void> {
        const countRes = await this.count(params)
        if (countRes + insertCount > system.getNumberOrThrow(AppSystemProp.MAX_RECORDS_PER_TABLE)) {
            throw new ActivepiecesError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: `Max records per table reached: ${system.getNumberOrThrow(AppSystemProp.MAX_RECORDS_PER_TABLE)}`,
                },
            })
        }
    },
};

type CreateParams = {
    request: CreateRecordsRequest
    projectId: string
    logger: FastifyBaseLogger
    fields?: Field[]
}

type ListParams = {
    tableId: string
    projectId: string
    cursorRequest: Cursor | null
    limit: number
    filters: Filter[] | null
    fields?: Field[]
}

type GetByIdParams = {
    id: string
    projectId: string
}

type UpdateParams = {
    id: string
    projectId: string
    request: UpdateRecordRequest
}

type DeleteParams = {
    ids: string[]
    projectId: string
}

type DeleteAllParams = {
    tableId: string
    projectId: string
}

type TriggerWebhooksParams = {
    projectId: string
    tableId: string
    eventType: TableWebhookEventType
    data: Record<string, unknown>
    logger: FastifyBaseLogger
    authorization: string
}

type CountParams = {
    projectId: string
    tableId: string
}

type RecordInsertion = {
    id: string
    tableId: string
    projectId: string
    created: string
}

type CellInsertion = {
    id: string
    recordId: string
    fieldId: string
    projectId: string
    value: string
}

function prepareRecordInsertions(
    records: Array<Array<{ fieldId: string, value: string | null }>>,
    tableId: string,
    projectId: string,
    baseDate: Date,
): RecordInsertion[] {
    return records.map((_, index) => {
        const created = new Date(baseDate.getTime() + index).toISOString()
        return {
            tableId,
            projectId,
            created,
            id: apId(),
        }
    })
}

function prepareCellInsertions(
    records: Array<Array<{ fieldId: string, value: string | null }>>,
    recordInsertions: RecordInsertion[],
    projectId: string,
): CellInsertion[] {
    return records.flatMap((recordData, index) =>
        recordData.map((cellData) => {
            return {
                recordId: recordInsertions[index].id,
                fieldId: cellData.fieldId,
                projectId,
                value: cellData.value ?? '',
                id: apId(),
            }
        })
    )
}

async function formatRecordsAndFetchField({ records, tableId, projectId, fields: prefetchedFields }: { records: RecordSchema[], tableId: string, projectId: string, fields?: Field[] }): Promise<PopulatedRecord[]> {
    const fields = prefetchedFields ?? await fieldService.getAll({
        tableId,
        projectId,
    })
    return formatRecords(records, fields)
}

function formatRecords(records: RecordSchema[], fields: Field[]): PopulatedRecord[] {
    const fieldsNamesMap: Record<string, string> = fields.reduce((acc, field) => {
        acc[field.id] = field.name
        return acc
    }, {} as Record<string, string>)
    return records.map((record) => {
        const cells = record.cells.reduce<PopulatedRecord['cells']>((acc, cell) => {
            acc[cell.fieldId] = {
                fieldName: fieldsNamesMap[cell.fieldId],
                value: cell.value,
                updated: cell.updated,
                created: cell.created,
            }
            return acc
        }, {})
        for (const field of fields) {
            if (!(field.id in cells)) {
                cells[field.id] = {
                    fieldName: field.name,
                    value: null,
                    updated: record.updated,
                    created: record.created,
                }
            }
        }
        return {
            ...record,
            cells,
        }
    })
}

function doesCellValueMatchFilters(cell: Pick<Cell, 'fieldId' | 'value'>, filters: Filter[]): boolean {
    if (filters.length === 0) {
        return true
    }
    return filters.every((filter) => {
        if (filter.fieldId !== cell.fieldId) {
            return true
        }
        switch (filter.operator) {
            case FilterOperator.EXISTS: {
                return cell.value !== null && cell.value !== ''
            }
            case FilterOperator.NOT_EXISTS: {
                return cell.value === null || cell.value === ''
            }
            case FilterOperator.EQ: {
                return cell.value === filter.value
            }
            case FilterOperator.NEQ: {
                return cell.value !== filter.value
            }
            case FilterOperator.GT: {
                return numberFilterValidator({ cellValue: cell.value, filterValue: filter.value, cb: ({ cellValue, filterValue }) => cellValue > filterValue })
            }
            case FilterOperator.GTE: {
                return numberFilterValidator({ cellValue: cell.value, filterValue: filter.value, cb: ({ cellValue, filterValue }) => cellValue >= filterValue })
            }
            case FilterOperator.LT: {
                return numberFilterValidator({ cellValue: cell.value, filterValue: filter.value, cb: ({ cellValue, filterValue }) => cellValue < filterValue })
            }
            case FilterOperator.LTE: {
                return numberFilterValidator({ cellValue: cell.value, filterValue: filter.value, cb: ({ cellValue, filterValue }) => cellValue <= filterValue })
            }
            case FilterOperator.CO: {
                if (typeof cell.value === 'string') {
                    return cell.value.toLowerCase().includes(filter.value.toLowerCase())
                }
                return false
            }
        }
    })
}

const numberFilterValidator = ({ cellValue, filterValue, cb }: { cellValue: unknown, filterValue: string, cb: ({ cellValue, filterValue }: { cellValue: number, filterValue: number }) => boolean }) => {
    if (typeof cellValue === 'string' || typeof cellValue === 'number') {
        const cv = parseFloat(cellValue as string)
        const fv = parseFloat(filterValue)
        if (isNaN(cv) || isNaN(fv)) {
            return false
        }
        return cb({ cellValue: cv, filterValue: fv })
    }
    return false
}