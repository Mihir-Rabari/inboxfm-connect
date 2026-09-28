import { ActivepiecesError, apId, ErrorCode, isNil, SeekPage } from '@inboxfm-connect/core-utils'
import { Execution, ExecutionEventType, ExecutionStatus, executionUtils, TokenUsage } from '@inboxfm-connect/shared'
import { repoFactory } from '../core/db/repo-factory'
import { ExecutionEntity, ExecutionSchema } from './execution-entity'
import { executionEventService } from './execution-event.service'

const executionRepo = repoFactory<ExecutionSchema>(ExecutionEntity)

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 100

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

const executionService = {
    async create({
        projectId,
        platformId,
        userId,
        prompt,
        metadata = {},
    }: {
        projectId: string
        platformId: string
        userId?: string | null
        prompt: string
        metadata?: Record<string, unknown>
    }): Promise<Execution> {
        const newExecution: Execution = {
            id: apId(),
            projectId,
            platformId,
            userId: userId ?? null,
            status: ExecutionStatus.CREATED,
            prompt,
            metadata,
            tokenUsage: null,
            cost: null,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            finishTime: null,
        }

        const saved = await executionRepo().save(newExecution)
        await executionEventService.emit({
            executionId: saved.id,
            type: ExecutionEventType.ExecutionStarted,
            payload: {
                executionId: saved.id,
                prompt: saved.prompt,
                timestamp: saved.created,
            },
        })

        return saved
    },

    async getOne({
        id,
        projectId,
    }: {
        id: string
        projectId: string
    }): Promise<Execution> {
        const execution = await executionRepo().findOneBy({ id, projectId })
        if (isNil(execution)) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: {
                    entityType: 'Execution',
                    entityId: id,
                },
            })
        }
        return execution
    },

    async updateStatus({
        id,
        projectId,
        status,
        tokenUsage,
        cost,
        finishTime,
    }: {
        id: string
        projectId: string
        status: ExecutionStatus
        tokenUsage?: TokenUsage | null
        cost?: number | null
        finishTime?: string | null
    }): Promise<Execution> {
        const current = await this.getOne({ id, projectId })

        if (!executionUtils.isValidExecutionStatusTransition({ from: current.status, to: status })) {
            throw new ActivepiecesError({
                code: ErrorCode.VALIDATION,
                params: {
                    message: `Invalid execution status transition from ${current.status} to ${status}`,
                },
            })
        }

        const updatedFields = {
            status,
            updated: new Date().toISOString(),
            ...(tokenUsage !== undefined ? { tokenUsage } : {}),
            ...(cost !== undefined ? { cost } : {}),
            ...(finishTime !== undefined ? { finishTime } : {}),
        }

        await executionRepo().update({ id, projectId }, updatedFields)
        const updated = await this.getOne({ id, projectId })

        if (status === ExecutionStatus.COMPLETED) {
            await executionEventService.emit({
                executionId: id,
                type: ExecutionEventType.ExecutionCompleted,
                payload: {
                    executionId: id,
                    totalTokens: tokenUsage?.totalTokens ?? null,
                    finishTime: updated.finishTime,
                },
            })
        }
        else if (status === ExecutionStatus.FAILED) {
            await executionEventService.emit({
                executionId: id,
                type: ExecutionEventType.ExecutionFailed,
                payload: {
                    executionId: id,
                    error: { message: 'Execution failed' },
                },
            })
        }
        else if (status === ExecutionStatus.CANCELLED) {
            await executionEventService.emit({
                executionId: id,
                type: ExecutionEventType.ExecutionCancelled,
                payload: {
                    executionId: id,
                    reason: 'Cancelled by request',
                },
            })
        }

        return updated
    },

    async list({
        projectId,
        status,
        limit = DEFAULT_LIMIT,
        cursor,
    }: {
        projectId: string
        status?: ExecutionStatus
        limit?: number
        cursor?: string
    }): Promise<SeekPage<Execution>> {
        const take = Math.min(Math.max(limit, 1), MAX_LIMIT) + 1 // take one extra to determine if there's a next page

        const decodedCursor = decodeCursor(cursor)

        const query = executionRepo()
            .createQueryBuilder('execution')
            .where('execution.projectId = :projectId', { projectId })

        if (!isNil(status)) {
            query.andWhere('execution.status = :status', { status })
        }

        if (decodedCursor) {
            query.andWhere(
                '(execution.created < :cursorCreated OR (execution.created = :cursorCreated AND execution.id > :cursorId))',
                { cursorCreated: decodedCursor.created, cursorId: decodedCursor.id },
            )
        }

        query.orderBy('execution.created', 'DESC').addOrderBy('execution.id', 'DESC').take(take)

        const items = await query.getMany()

        let next: string | null = null
        let previous: string | null = null

        if (items.length > take - 1) {
            const lastItem = items[take - 2] // second to last (since we took one extra)
            next = encodeCursor(lastItem.created, lastItem.id)
            items.pop() // remove the extra item
        }

        if (cursor) {
            // For previous cursor, we need to get the first item of the current page
            // and encode a cursor that would return items before it
            // This is a simplified implementation - in practice, you might want to fetch the previous page
            previous = encodeCursor(items[0].created, items[0].id)
        }

        return {
            data: items,
            next,
            previous,
        }
    },
}

export { executionService }
