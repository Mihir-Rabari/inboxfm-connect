import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../../helpers/db'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

/**
 * Coverage for the mirror-safe MCP export added for #51
 * (`GET /v1/projects/:projectId/mcp-server/mirror-state`).
 *
 * The shape carries type plus disabled tools only — bearer tokens must never
 * cross trust boundaries, so the suite asserts the token key is absent, not
 * merely redacted. Read-only by design: rotation and apply stay deferred
 * until the #55 plan envelope lands.
 */
let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

function mirrorUrl(projectId: string): string {
    return `/v1/projects/${projectId}/mcp-server/mirror-state`
}

describe('GET /v1/projects/:projectId/mcp-server/mirror-state', () => {
    it('exports the configured state without the bearer token', async () => {
        const ctx = await createTestContext(app!)
        await ctx.post(`/v1/projects/${ctx.project.id}/mcp-server`, {
            disabledTools: ['ap_delete_table'],
        })

        const response = await ctx.get(mirrorUrl(ctx.project.id))

        expect(response?.statusCode, response?.payload).toBe(StatusCodes.OK)
        const body = response!.json()
        expect(body.projectId).toBe(ctx.project.id)
        expect(body.configured).toBe(true)
        expect(body.type).toBe('PROJECT')
        expect(body.disabledTools).toEqual(['ap_delete_table'])
        expect('token' in body).toBe(false)
    })

    it('reports unconfigured when no server row exists yet', async () => {
        const ctx = await createTestContext(app!)

        const response = await ctx.get(mirrorUrl(ctx.project.id))

        expect(response?.statusCode, response?.payload).toBe(StatusCodes.OK)
        const body = response!.json()
        expect(body.configured).toBe(false)
        expect(body.type).toBeNull()
        expect(body.disabledTools).toEqual([])
        expect('token' in body).toBe(false)
    })

    it('does not create a server row as a side effect', async () => {
        const ctx = await createTestContext(app!)
        expect(await db.findOneBy('mcp_server', { projectId: ctx.project.id })).toBeNull()

        await ctx.get(mirrorUrl(ctx.project.id))

        expect(await db.findOneBy('mcp_server', { projectId: ctx.project.id })).toBeNull()
    })

    it('denies exporting the mirror state of another project', async () => {
        const victim = await createTestContext(app!)
        const attacker = await createTestContext(app!)

        const response = await attacker.get(mirrorUrl(victim.project.id))

        expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('rejects an unauthenticated export', async () => {
        const ctx = await createTestContext(app!)

        const response = await app!.inject({ method: 'GET', url: `/api${mirrorUrl(ctx.project.id)}` })

        expect(response.statusCode).toBeGreaterThanOrEqual(StatusCodes.UNAUTHORIZED)
    })
})
