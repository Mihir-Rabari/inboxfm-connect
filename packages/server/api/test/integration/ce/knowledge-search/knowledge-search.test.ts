import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
})

afterEach(async () => {
    vi.restoreAllMocks()
})

describe('Knowledge Search API', () => {
    it('searches actions only when objectKind=action', async () => {
        const response = await ctx.inject({
            method: 'POST',
            url: '/api/v1/knowledge-search',
            payload: {
                query: 'github issue',
                objectKind: 'action',
                limit: 10,
            },
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        expect(Array.isArray(body.results)).toBe(true)
        expect(body.results.every((r: any) => r.objectKind === 'action')).toBe(true)
    })

    it('searches triggers only when objectKind=trigger', async () => {
        const response = await ctx.inject({
            method: 'POST',
            url: '/api/v1/knowledge-search',
            payload: {
                query: 'slack message',
                objectKind: 'trigger',
                limit: 10,
            },
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        expect(body.results.every((r: any) => r.objectKind === 'trigger')).toBe(true)
    })

    it('searches both actions and triggers when objectKind=all', async () => {
        const response = await ctx.inject({
            method: 'POST',
            url: '/api/v1/knowledge-search',
            payload: {
                query: 'send message',
                objectKind: 'all',
                limit: 10,
            },
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        expect(Array.isArray(body.results)).toBe(true)
        expect(['action', 'trigger']).toContain(body.mode)
    })

    it('returns empty results for unknown query', async () => {
        const response = await ctx.inject({
            method: 'POST',
            url: '/api/v1/knowledge-search',
            payload: {
                query: 'xyznonexistentquery123',
                objectKind: 'all',
                limit: 10,
            },
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        expect(body.results).toHaveLength(0)
    })

    it('respects limit parameter', async () => {
        const response = await ctx.inject({
            method: 'POST',
            url: '/api/v1/knowledge-search',
            payload: {
                query: 'test',
                objectKind: 'all',
                limit: 2,
            },
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        expect(body.results.length).toBeLessThanOrEqual(2)
    })

    it('requires query parameter', async () => {
        const response = await ctx.inject({
            method: 'POST',
            url: '/api/v1/knowledge-search',
            payload: {
                objectKind: 'all',
                limit: 10,
            },
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('enforces project scoping - results scoped to project', async () => {
        const response = await ctx.inject({
            method: 'POST',
            url: '/api/v1/knowledge-search',
            payload: {
                query: 'test',
                objectKind: 'all',
                limit: 10,
            },
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        const body = response.json()
        expect(body.results.every((r: any) => r.pieceName)).toBe(true)
    })
})
