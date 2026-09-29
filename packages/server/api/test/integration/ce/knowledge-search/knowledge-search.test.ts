import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('POST /v1/knowledge-search/query (issue #138)', () => {
    it('returns a results envelope for a valid query', async () => {
        const ctx = await createTestContext(app!)
        const response = await ctx.post('/v1/knowledge-search/query', {
            query: 'send slack message',
            limit: 5,
            objectKind: 'all',
        })
        expect(response?.statusCode).toBe(StatusCodes.OK)
        const body = response!.json()
        expect(Array.isArray(body.results)).toBe(true)
        expect(['semantic', 'keyword']).toContain(body.mode)
    })

    it('rejects an empty query with 400', async () => {
        const ctx = await createTestContext(app!)
        const response = await ctx.post('/v1/knowledge-search/query', {
            query: '',
        })
        expect(response?.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('rejects an unknown objectKind with 400', async () => {
        const ctx = await createTestContext(app!)
        const response = await ctx.post('/v1/knowledge-search/query', {
            query: 'send slack message',
            objectKind: 'bogus',
        })
        expect(response?.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })
})
