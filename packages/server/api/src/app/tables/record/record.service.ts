import { ActivepiecesError, apId, chunk, Cursor, ErrorCode, isNil, SeekPage } from '@inboxfm-connect/core-utils'
import { Cell, CreateRecordsRequest, Field, Filter, FilterOperator, PopulatedRecord, TableWebhookEventType, UpdateRecordRequest } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { EntityManager, In } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { transaction } from '../../core/db/transaction'
import { system } from '../../helper/system/system'
import { AppSystemProp } from '../../helper/system/system-props'
import { FieldEntity } from '../field/field.entity'
import { fieldService } from '../field/field.service'
import { CellEntity } from './cell.entity'
import { RecordEntity, RecordSchema } from './record.entity'

const MAX_BATCH_SIZE = 50
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 100

const recordRepo = repoFactory(RecordEntity)
const cellsRepo = repoFactory(CellEntity)

function decodeCursor(cursor: string | null): { created: string; id: string } | null {
    if (!cursor) return null
    try {
        const decoded = Buffer.from(cursor, 'base64').toString('utf-8')
        const [created, id] = decoded.split('|')
        return { created, id }
    } catch {
        return null
    }
}

function encodeCursor(created: string, id: string): string {
    return Buffer.from(`${created}|${id}`, 'utf-8').toString('base64')
}

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
        filters,
        limit = DEFAULT_LIMIT,
        cursor,
    }: ListParams): Promise<SeekPage<PopulatedRecord>> {
        const fields = await fieldService.getAll({
            tableId,
            projectId,
        })
        
        const take = Math.min(Math.max(limit, 1), MAX_LIMIT) + 1 // take one extra to determine if there's a next page
        const decodedCursor = decodeCursor(cursor)

        // Build where clause for records
        const recordWhere: any = {
            projectId,
            tableId,
        }

        // Apply cursor pagination
        if (decodedCursor) {
            recordWhere._and = [
                {
                    created: decodedCursor.created,
                    id: MoreThan(decodedCursor.id)
                },
                {
                    created: MoreThan(decodedCursor.created)
                }
            ]
        }

        // Get records with pagination and basic filtering that can be done at DB level
        const recordsQuery = recordRepo()
            .createQueryBuilder('record')
            .where('record.projectId = :projectId', { projectId })
            .andWhere('record.tableId = :tableId', { tableId })

        // Apply cursor conditions
        if (decodedCursor) {
            recordsQuery.andWhere(
                '(record.created > :cursorCreated OR (record.created = :cursorCreated AND record.id > :cursorId))',
                { cursorCreated: decodedCursor.created, cursorId: decodedCursor.id }
            )
        }

        // Order by created ASC, id ASC for consistent pagination
        recordsQuery.orderBy('record.created', 'ASC').addOrderBy('record.id', 'ASC').limit(take)

        const records = await recordsQuery.getMany()

        // Apply filters that require checking cell values (need to be done in memory after fetching cells)
        // For now, we'll fetch all cells for these records and filter in memory
        // In a more advanced implementation, we could push some filters to the DB
        const recordIds = records.map(record => record.id)
        let cells: CellEntity[] = []
        if (recordIds.length > 0) {
            cells = await cellsRepo().find({
                where: {
                    projectId,
                    fieldId: In(fields.map(field => field.id)),
                    recordId: In(recordIds),
                },
            })
        }

        // Group cells by recordId
        const cellsByRecordId = new Map<string, CellEntity[]>()
        for (const cell of cells) {
            const group = cellsByRecordId.get(cell.recordId)
            if (group) {
                group.push(cell)
            } else {
                cellsByRecordId.set(cell.recordId, [cell])
            }
        }

        // Attach cells to records
        for (const record of records) {
            record.cells = cellsByRecordId.get(record.id) ?? []
        }

        // Apply filters in memory (those that couldn't be pushed to DB)
        const filteredRecords = records.filter(record => {
            if (!filters || filters.length === 0) {
                return true
            }
            return filters.every(filter => {
                const cell = record.cells.find(c => c.fieldId === filter.fieldId) ?? { fieldId: filter.fieldId, value: '' }
                return doesCellValueMatchFilters(cell, [filter])
            })
        })

        // Format the records
        const populatedRecords = await formatRecordsAndFetchField({ 
            records: filteredRecords, 
            tableId, 
            projectId, 
            fields 
        })

        // Prepare pagination response
        let next: string | null = null
        let previous: string | null = null

        // If we have more records than the limit, we have a next page
        if (populatedRecords.length > limit) {
            const lastRecord = populatedRecords[limit - 1] // The last record that would be in the current page
            next = encodeCursor(lastRecord.created, lastRecord.id)
            // Remove the extra record we fetched
            populatedRecords.splice(limit, populatedRecords.length - limit)
        }

        // Set previous cursor if we had a cursor in the request (for backwards pagination)
        if (cursor) {
            // For simplicity, we'll set previous to the current cursor
            // A more sophisticated implementation would calculate the actual previous page cursor
            previous = cursor
        }

        return {
            data: populatedRecords,
            next,
            previous,
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
                    entityType: 'Record',
                    entityId: id,
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
                params: { entityType: 'Record', entityId: ids[0] },
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
}

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

import { MoreThan } from 'typeorm'

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
        }),
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
                fieldName: fieldNamesMap[cell.fieldId],
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
