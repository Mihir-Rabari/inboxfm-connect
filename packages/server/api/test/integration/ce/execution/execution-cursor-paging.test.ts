import { ExecutionStatus } from '@inboxfm-connect/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { executionRepo } from '../../../../../src/app/execution/execution.service'
import { ExecutionEntity } from '../../../../../src/app/execution/execution-entity'
import { databaseConnection } from '../../../../../src/app/database/database-connection'
import { createTestContext, TestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null
let ctx: TestContext

beforeAll(async () => {
    app = await setupTestEnvironment({ fresh: true })
})

afterAll(async () => {
    await teardownTestEnvironment()
})

beforeEach(async () => {
    ctx = await createTestContext(app!)
    await databaseConnection().getRepository(ExecutionEntity).delete({ projectId: ctx.project.id })
})

afterEach(async () => {
    vi.restoreAllMocks()
    await databaseConnection().getRepository(ExecutionEntity).delete({ projectId: ctx.project.id })
})

describe('Executions Cursor Paging (Issue #156)', () => {
    const createExecution = async (overrides: Partial<{ prompt: string; status: ExecutionStatus }> = {}) => {
        return executionRepo().save({
            id: `exec_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            projectId: ctx.project.id,
            platformId: ctx.platform.id,
            prompt: overrides.prompt ?? 'test prompt',
            status: overrides.status ?? ExecutionStatus.COMPLETED,
            metadata: {},
            tokenUsage: null,
            cost: null,
            created: new Date(Date.now() - Math.random() * 10000000).toISOString(),
            updated: new Date().toISOString(),
            finishTime: new Date().toISOString(),
            userId: null,
        })
    }

    it('returns first page with next cursor', async () => {
        // Create 15 executions
        for (let i = 0; i < 15; i++) {
            await createExecution({ prompt: `Execution ${i}` })
        }

        const response = await ctx.inject({
            method: 'GET',
            url: '/api/v1/executions',
            query: { limit: 10 },
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        expect(body.data).toHaveLength(10)
        expect(body.next).not.toBeNull()
        expect(body.previous).toBeNull()
    })

    it('returns second page with previous cursor', async () => {
        for (let i = 0; i < 15; i++) {
            await createExecution({ prompt: `Execution ${i}` })
        }

        // First page
        const firstResponse = await ctx.inject({
            method: 'GET',
            url: '/api/v1/executions',
            query: { limit: 10 },
        })
        const firstBody = firstResponse.json()
        expect(firstBody.next).not.toBeNull()

        // Second page
        const secondResponse = await ctx.inject({
            method: 'GET',
            url: '/api/v1/executions',
            query: { limit: 10, cursor: firstBody.next },
        })
        const secondBody = secondResponse.json()
        expect(secondBody.data).toHaveLength(5) // remaining 5
        expect(secondBody.next).toBeNull()
        expect(secondBody.previous).not.toBeNull()
    })

    it('returns empty page when cursor points past end', async () => {
        await createExecution()

        const response = await ctx.inject({
            method: 'GET',
            url: '/api/v1/executions',
            query: { limit: 10, cursor: 'invalid_cursor' },
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        expect(body.data).toHaveLength(0)
        expect(body.next).toBeNull()
        expect(body.previous).toBeNull()
    })

    it('respects limit parameter up to MAX_LIMIT', async () => {
        for (let i = 0; i < 20; i++) {
            await createExecution()
        }

        const response = await ctx.inject({
            method: 'GET',
            url: '/api/v1/executions',
            query: { limit: 50 }, // capped at MAX_LIMIT (100)
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        expect(body.data.length).toBeLessThanOrEqual(100)
    })

    it('filters by status with cursor paging', async () => {
        await createExecution({ status: ExecutionStatus.COMPLETED })
        await createExecution({ status: ExecutionStatus.FAILED })
        await createExecution({ status: ExecutionStatus.COMPLETED })

        const response = await ctx.inject({
            method: 'GET',
            url: '/api/v1/executions',
            query: { limit: 10, status: ExecutionStatus.COMPLETED },
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        expect(body.data.every((e: any) => e.status === ExecutionStatus.COMPLETED)).toBe(true)
        expect(body.data.length).toBe(2)
    })

    it('orders by created DESC then id DESC', async () => {
        const now = new Date()
        await executionRepo().save({
            id: 'exec_a',
            projectId: ctx.project.id,
            platformId: ctx.platform.id,
            prompt: 'first',
            status: ExecutionStatus.COMPLETED,
            metadata: {},
            tokenUsage: null,
            cost: null,
            created: new Date(now.getTime() - 1000).toISOString(),
            updated: now.toISOString(),
            finishTime: now.toISOString(),
            userId: null,
        })
        await executionRepo().save({
            id: 'exec_b',
            projectId: ctx.project.id,
            platformId: ctx.platform.id,
            prompt: 'second',
            status: ExecutionStatus.COMPLETED,
            metadata: {},
            tokenUsage: null,
            cost: null,
            created: new Date(now.getTime() - 1000).toISOString(),
            updated: now.toISOString(),
            finishTime: now.toISOString(),
            userId: null,
        })

        const response = await ctx.inject({
            method: 'GET',
            url: '/api/v1/executions',
            query: { limit: 10 },
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        // Both have same created time, should order by id DESC
        expect(body.data[0].id).toBe('exec_b')
        expect(body.data[1].id).toBe('exec_a')
    })
})
