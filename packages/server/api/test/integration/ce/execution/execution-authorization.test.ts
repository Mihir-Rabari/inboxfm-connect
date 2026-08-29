import { apId } from '@inboxfm-connect/core-utils'
import { ExecutionEventType, ExecutionStatus, ExecutionToolCallStatus } from '@inboxfm-connect/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { executionEventService } from '../../../../src/app/execution/execution-event.service'
import { db } from '../../../helpers/db'
import { createTestContext, TestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

async function createExecutionViaApi(ctx: TestContext, prompt: string): Promise<{ id: string }> {
    const response = await ctx.post('/v1/executions', {
        projectId: ctx.project.id,
        prompt,
    })
    expect(response?.statusCode).toBe(StatusCodes.CREATED)
    return response!.json()
}

async function saveExecutionRow(ctx: TestContext, prompt: string): Promise<{ id: string }> {
    const now = new Date().toISOString()
    const row = {
        id: apId(),
        created: now,
        updated: now,
        projectId: ctx.project.id,
        platformId: ctx.platform.id,
        userId: ctx.user.id,
        status: ExecutionStatus.CREATED,
        prompt,
        metadata: {},
        tokenUsage: null,
        cost: null,
        finishTime: null,
    }
    await db.save('execution', row)
    return row
}

async function saveToolCallRow(params: { executionId: string, projectId: string }): Promise<{ id: string }> {
    const now = new Date().toISOString()
    const row = {
        id: apId(),
        created: now,
        updated: now,
        executionId: params.executionId,
        projectId: params.projectId,
        pieceName: '@inboxfm-connect/piece-slack',
        pieceVersion: '0.1.0',
        actionName: 'send_message',
        connectionId: null,
        input: { text: 'hello' },
        output: { ok: true },
        status: ExecutionToolCallStatus.SUCCEEDED,
        error: null,
        latencyMs: 42,
        finished: now,
    }
    await db.save('tool_call', row)
    return row
}

async function saveTriggerBindingRow(ctx: TestContext): Promise<{ id: string }> {
    const now = new Date().toISOString()
    const row = {
        id: apId(),
        created: now,
        updated: now,
        projectId: ctx.project.id,
        platformId: ctx.platform.id,
        pieceName: '@inboxfm-connect/piece-webhook',
        pieceVersion: '0.1.0',
        triggerName: 'catch_webhook',
        connectionId: null,
        promptTemplate: 'Handle {{item}}',
        settings: {},
        propertySettings: null,
        status: 'ENABLED',
    }
    await db.save('trigger_binding', row)
    return row
}

async function saveScheduledTaskRow(ctx: TestContext): Promise<{ id: string }> {
    const now = new Date().toISOString()
    const row = {
        id: apId(),
        created: now,
        updated: now,
        projectId: ctx.project.id,
        platformId: ctx.platform.id,
        prompt: 'Compile the daily revenue summary',
        cronExpression: '0 8 * * *',
        timezone: 'UTC',
        status: 'ENABLED',
        lastRunAt: null,
        nextRunAt: null,
    }
    await db.save('scheduled_task', row)
    return row
}

async function waitUntil(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
    const start = Date.now()
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) {
            throw new Error('waitUntil: condition not met within timeout')
        }
        await new Promise((resolve) => setTimeout(resolve, 20))
    }
}

describe('Execution authorization (USER principal, :id routes)', () => {
    describe('GET /v1/executions/:id', () => {
        it('resolves the tenant from the execution row for its own project', async () => {
            const ctx = await createTestContext(app!)
            const execution = await createExecutionViaApi(ctx, 'Summarize new issues')

            const response = await ctx.get(`/v1/executions/${execution.id}`)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response!.json()
            expect(body.id).toBe(execution.id)
            expect(body.projectId).toBe(ctx.project.id)
            expect(body.status).toBe(ExecutionStatus.CREATED)
        })

        it('denies access to an execution owned by another project', async () => {
            const ctxA = await createTestContext(app!)
            const ctxB = await createTestContext(app!)
            const execution = await saveExecutionRow(ctxA, 'Project A only')

            const response = await ctxB.get(`/v1/executions/${execution.id}`)

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        })

        it('returns not found for an unknown execution id', async () => {
            const ctx = await createTestContext(app!)

            const response = await ctx.get(`/v1/executions/${apId()}`)

            expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
        })
    })

    describe('GET /v1/executions/:id/tool-calls', () => {
        it('returns the tool calls of its own execution', async () => {
            const ctx = await createTestContext(app!)
            const execution = await saveExecutionRow(ctx, 'With tool calls')
            const toolCall = await saveToolCallRow({ executionId: execution.id, projectId: ctx.project.id })

            const response = await ctx.get(`/v1/executions/${execution.id}/tool-calls`)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            const body = response!.json()
            expect(body).toHaveLength(1)
            expect(body[0].id).toBe(toolCall.id)
            expect(body[0].status).toBe(ExecutionToolCallStatus.SUCCEEDED)
        })

        it('returns an empty list when nothing wrote tool calls', async () => {
            const ctx = await createTestContext(app!)
            const execution = await saveExecutionRow(ctx, 'No tool calls')

            const response = await ctx.get(`/v1/executions/${execution.id}/tool-calls`)

            expect(response?.statusCode).toBe(StatusCodes.OK)
            expect(response!.json()).toEqual([])
        })

        it('denies access to tool calls of another project execution', async () => {
            const ctxA = await createTestContext(app!)
            const ctxB = await createTestContext(app!)
            const execution = await saveExecutionRow(ctxA, 'Project A only')
            await saveToolCallRow({ executionId: execution.id, projectId: ctxA.project.id })

            const response = await ctxB.get(`/v1/executions/${execution.id}/tool-calls`)

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        })
    })

    describe('GET /v1/executions/:id/events (SSE)', () => {
        it('streams data-only frames to the owning project', async () => {
            const ctx = await createTestContext(app!)
            const execution = await saveExecutionRow(ctx, 'Streamed execution')

            const response = await ctx.inject({
                method: 'GET',
                url: `/api/v1/executions/${execution.id}/events`,
                payloadAsStream: true,
            })

            expect(response.statusCode).toBe(StatusCodes.OK)
            expect(response.headers['content-type']).toBe('text/event-stream')

            const stream = response.stream()
            let received = ''
            stream.on('data', (chunk: Buffer) => {
                received += chunk.toString()
            })

            await executionEventService.emit({
                executionId: execution.id,
                type: ExecutionEventType.ExecutionStarted,
                payload: { executionId: execution.id, prompt: 'Streamed execution', timestamp: new Date().toISOString() },
            })

            await waitUntil(() => received.includes('data: '))

            expect(received.startsWith('data: ')).toBe(true)
            expect(received.endsWith('\n\n')).toBe(true)
            expect(received).not.toContain('event: ')
            const frame = JSON.parse(received.slice('data: '.length, -2))
            expect(frame.type).toBe(ExecutionEventType.ExecutionStarted)
            expect(frame.executionId).toBe(execution.id)

            stream.destroy()
        })

        it('denies streaming an execution owned by another project', async () => {
            const ctxA = await createTestContext(app!)
            const ctxB = await createTestContext(app!)
            const execution = await saveExecutionRow(ctxA, 'Project A only')

            const response = await ctxB.get(`/v1/executions/${execution.id}/events`)

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        })
    })

    describe('GET /v1/executions (list)', () => {
        it('requires projectId and scopes results to it', async () => {
            const ctxA = await createTestContext(app!)
            const ctxB = await createTestContext(app!)
            await saveExecutionRow(ctxA, 'A one')
            await saveExecutionRow(ctxB, 'B one')

            const withoutProject = await ctxA.get('/v1/executions')
            expect(withoutProject?.statusCode).toBe(StatusCodes.FORBIDDEN)

            const scoped = await ctxA.get('/v1/executions', { projectId: ctxA.project.id })
            expect(scoped?.statusCode).toBe(StatusCodes.OK)
            const body = scoped!.json()
            expect(body.data).toHaveLength(1)
            expect(body.data[0].prompt).toBe('A one')
            expect(body.next).toBeNull()
            expect(body.previous).toBeNull()
        })

        it('denies listing another project executions', async () => {
            const ctxA = await createTestContext(app!)
            const ctxB = await createTestContext(app!)

            const response = await ctxB.get('/v1/executions', { projectId: ctxA.project.id })

            expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        })
    })
})

describe('Trigger binding authorization (USER principal, :id routes)', () => {
    it('reads its own trigger binding detail', async () => {
        const ctx = await createTestContext(app!)
        const binding = await saveTriggerBindingRow(ctx)

        const response = await ctx.get(`/v1/trigger-bindings/${binding.id}`)

        expect(response?.statusCode, response?.payload).toBe(StatusCodes.OK)
        expect(response!.json().id).toBe(binding.id)
    })

    it('denies reading a trigger binding of another project', async () => {
        const ctxA = await createTestContext(app!)
        const ctxB = await createTestContext(app!)
        const binding = await saveTriggerBindingRow(ctxA)

        const response = await ctxB.get(`/v1/trigger-bindings/${binding.id}`)

        expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('denies mutating a trigger binding of another project', async () => {
        const ctxA = await createTestContext(app!)
        const ctxB = await createTestContext(app!)
        const binding = await saveTriggerBindingRow(ctxA)

        const disable = await ctxB.post(`/v1/trigger-bindings/${binding.id}/disable`)
        expect(disable?.statusCode).toBe(StatusCodes.FORBIDDEN)

        const removed = await ctxB.delete(`/v1/trigger-bindings/${binding.id}`)
        expect(removed?.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
})

describe('Scheduled task authorization (USER principal, :id routes)', () => {
    it('reads its own scheduled task detail', async () => {
        const ctx = await createTestContext(app!)
        const task = await saveScheduledTaskRow(ctx)

        const response = await ctx.get(`/v1/scheduled-tasks/${task.id}`)

        expect(response?.statusCode, response?.payload).toBe(StatusCodes.OK)
        expect(response!.json().id).toBe(task.id)
    })

    it('denies reading a scheduled task of another project', async () => {
        const ctxA = await createTestContext(app!)
        const ctxB = await createTestContext(app!)
        const task = await saveScheduledTaskRow(ctxA)

        const response = await ctxB.get(`/v1/scheduled-tasks/${task.id}`)

        expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('denies deleting a scheduled task of another project', async () => {
        const ctxA = await createTestContext(app!)
        const ctxB = await createTestContext(app!)
        const task = await saveScheduledTaskRow(ctxA)

        const response = await ctxB.delete(`/v1/scheduled-tasks/${task.id}`)

        expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
})

describe('POST /v1/execute authorization (direct tool run)', () => {
    it('accepts the target project from the request body', async () => {
        const ctx = await createTestContext(app!)

        const response = await ctx.post('/v1/execute', {
            projectId: ctx.project.id,
            integration: '@inboxfm-connect/piece-does-not-exist',
            tool: 'noop',
            connectionId: apId(),
            input: {},
        })

        // The runtime will fail on the unknown piece; what matters here is that
        // authorization resolved the project instead of rejecting the principal.
        expect(response?.statusCode).not.toBe(StatusCodes.FORBIDDEN)
    })

    it('denies executing against another project', async () => {
        const ctxA = await createTestContext(app!)
        const ctxB = await createTestContext(app!)

        const response = await ctxB.post('/v1/execute', {
            projectId: ctxA.project.id,
            integration: '@inboxfm-connect/piece-does-not-exist',
            tool: 'noop',
            connectionId: apId(),
            input: {},
        })

        expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
})

describe('Automation list/create authorization (projectId is mandatory)', () => {
    it('rejects a trigger binding list without projectId and accepts it with one', async () => {
        const ctx = await createTestContext(app!)
        await saveTriggerBindingRow(ctx)

        const withoutProject = await ctx.get('/v1/trigger-bindings')
        expect(withoutProject?.statusCode).toBe(StatusCodes.FORBIDDEN)

        const scoped = await ctx.get('/v1/trigger-bindings', { projectId: ctx.project.id })
        expect(scoped?.statusCode).toBe(StatusCodes.OK)
        expect(scoped!.json().data).toHaveLength(1)
    })

    it('rejects a scheduled task list without projectId and accepts it with one', async () => {
        const ctx = await createTestContext(app!)
        await saveScheduledTaskRow(ctx)

        const withoutProject = await ctx.get('/v1/scheduled-tasks')
        expect(withoutProject?.statusCode).toBe(StatusCodes.FORBIDDEN)

        const scoped = await ctx.get('/v1/scheduled-tasks', { projectId: ctx.project.id })
        expect(scoped?.statusCode).toBe(StatusCodes.OK)
        expect(scoped!.json().data).toHaveLength(1)
    })

    it('rejects a trigger binding create without projectId in the body', async () => {
        const ctx = await createTestContext(app!)

        const response = await ctx.post('/v1/trigger-bindings', {
            pieceName: '@inboxfm-connect/piece-webhook',
            pieceVersion: '0.1.0',
            triggerName: 'catch_webhook',
            promptTemplate: 'Handle {{item}}',
            settings: {},
        })

        expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('rejects a scheduled task create without projectId in the body', async () => {
        const ctx = await createTestContext(app!)

        const response = await ctx.post('/v1/scheduled-tasks', {
            prompt: 'Daily summary',
            cronExpression: '0 8 * * *',
            timezone: 'UTC',
        })

        expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('denies creating a trigger binding in another project', async () => {
        const ctxA = await createTestContext(app!)
        const ctxB = await createTestContext(app!)

        const response = await ctxB.post('/v1/trigger-bindings', {
            projectId: ctxA.project.id,
            pieceName: '@inboxfm-connect/piece-webhook',
            pieceVersion: '0.1.0',
            triggerName: 'catch_webhook',
            promptTemplate: 'Handle {{item}}',
            settings: {},
        })

        expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
})
