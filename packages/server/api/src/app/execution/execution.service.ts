import { ActivepiecesError, apId, ErrorCode, isNil, SeekPage } from '@inboxfm-connect/core-utils'
import { Execution, ExecutionStatus, executionUtils, TokenUsage } from '@inboxfm-connect/shared'
import { repoFactory } from '../core/db/repo-factory'
import { ExecutionEntity, ExecutionSchema } from './execution-entity'

const executionRepo = repoFactory<ExecutionSchema>(ExecutionEntity)

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

        return executionRepo().save(newExecution)
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
                code: ErrorCode.INVALID_PARAMS,
                params: {
                    message: `Invalid execution status transition from ${current.status} to ${status}`,
                },
            })
        }

        const updatedFields: Partial<Execution> = {
            status,
            updated: new Date().toISOString(),
            ...(tokenUsage !== undefined ? { tokenUsage } : {}),
            ...(cost !== undefined ? { cost } : {}),
            ...(finishTime !== undefined ? { finishTime } : {}),
        }

        await executionRepo().update({ id, projectId }, updatedFields)
        return this.getOne({ id, projectId })
    },

    async list({
        projectId,
        status,
        limit = 10,
    }: {
        projectId: string
        status?: ExecutionStatus
        limit?: number
    }): Promise<SeekPage<Execution>> {
        const query = executionRepo()
            .createQueryBuilder('execution')
            .where('execution.projectId = :projectId', { projectId })

        if (!isNil(status)) {
            query.andWhere('execution.status = :status', { status })
        }

        query.orderBy('execution.created', 'DESC').take(limit)

        const items = await query.getMany()
        return {
            data: items,
            next: null,
            previous: null,
        }
    },
}

export { executionService }
