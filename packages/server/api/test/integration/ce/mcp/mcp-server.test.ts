import { apId } from '@inboxfm-connect/core-utils'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../../helpers/db'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

/**
 * Coverage for the project MCP configuration surface the console reads
 * (`/v1/projects/:projectId/mcp-server` and its rotate/token actions).
 *
 * `mcpServerModule` had been commented out of `app.ts`, so all four routes answered
 * 404 while the MCP Hub page expected them; these tests pin that they are mounted and
 * project-scoped.
 *
 * Deliberately NOT covered, because it does not exist: the `POST /mcp` protocol
 * transport and the MCP OAuth authorize/approve flow were removed with the legacy
 * runtime. MCP invocations also do not write `execution` rows, so there is no MCP
 * provenance to assert in Activity — see FINAL_FRONTEND_RELEASE_CERTIFICATION.md.
 */
let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

function mcpUrl(projectId: string, suffix = ''): string {
    return `/v1/projects/${projectId}/mcp-server${suffix}`
}

describe('GET /v1/projects/:projectId/mcp-server', () => {
    it('lazily creates and returns the project MCP server', async () => {
        const ctx = await createTestContext(app!)

        const response = await ctx.get(mcpUrl(ctx.project.id))

        expect(response?.statusCode, response?.payload).toBe(StatusCodes.OK)
        const body = response!.json()
        expect(body.projectId).toBe(ctx.project.id)
        expect(typeof body.token).toBe('string')
        expect(body.token.length).toBeGreaterThan(0)
        expect(body.disabledTools).toEqual([])
    })

    it('is idempotent — a second read returns the same server and token', async () => {
        const ctx = await createTestContext(app!)

        const first = await ctx.get(mcpUrl(ctx.project.id))
        const second = await ctx.get(mcpUrl(ctx.project.id))

        expect(first!.json().id).toBe(second!.json().id)
        expect(first!.json().token).toBe(second!.json().token)
    })

    it('denies reading the MCP server of another project', async () => {
        const victim = await createTestContext(app!)
        const attacker = await createTestContext(app!)

        const response = await attacker.get(mcpUrl(victim.project.id))

        expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('rejects an unauthenticated read', async () => {
        const ctx = await createTestContext(app!)

        const response = await app!.inject({ method: 'GET', url: `/api${mcpUrl(ctx.project.id)}` })

        expect(response.statusCode).toBeGreaterThanOrEqual(StatusCodes.UNAUTHORIZED)
    })
})

describe('POST /v1/projects/:projectId/mcp-server', () => {
    it('persists disabledTools', async () => {
        const ctx = await createTestContext(app!)

        const response = await ctx.post(mcpUrl(ctx.project.id), {
            disabledTools: ['ap_delete_table', 'ap_delete_records'],
        })

        expect(response?.statusCode, response?.payload).toBe(StatusCodes.OK)
        expect(response!.json().disabledTools).toEqual(['ap_delete_table', 'ap_delete_records'])

        const reread = await ctx.get(mcpUrl(ctx.project.id))
        expect(reread!.json().disabledTools).toEqual(['ap_delete_table', 'ap_delete_records'])
    })

    it('denies updating the MCP server of another project', async () => {
        const victim = await createTestContext(app!)
        const attacker = await createTestContext(app!)
        await victim.get(mcpUrl(victim.project.id))

        const response = await attacker.post(mcpUrl(victim.project.id), { disabledTools: ['ap_list_tables'] })

        expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)

        const reread = await victim.get(mcpUrl(victim.project.id))
        expect(reread!.json().disabledTools).toEqual([])
    })
})

describe('POST /v1/projects/:projectId/mcp-server/rotate', () => {
    it('replaces the stored token and leaves configuration intact', async () => {
        const ctx = await createTestContext(app!)
        await ctx.post(mcpUrl(ctx.project.id), { disabledTools: ['ap_delete_table'] })
        const before = (await ctx.get(mcpUrl(ctx.project.id)))!.json()

        const response = await ctx.post(mcpUrl(ctx.project.id, '/rotate'))

        expect(response?.statusCode, response?.payload).toBe(StatusCodes.OK)
        const after = response!.json()
        expect(after.id).toBe(before.id)
        expect(after.token).not.toBe(before.token)
        expect(after.disabledTools).toEqual(['ap_delete_table'])
    })

    it('denies rotating the token of another project', async () => {
        const victim = await createTestContext(app!)
        const attacker = await createTestContext(app!)
        const before = (await victim.get(mcpUrl(victim.project.id)))!.json()

        const response = await attacker.post(mcpUrl(victim.project.id, '/rotate'))

        expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
        const after = (await victim.get(mcpUrl(victim.project.id)))!.json()
        expect(after.token).toBe(before.token)
    })

    it('rejects a malformed projectId in the path', async () => {
        const ctx = await createTestContext(app!)

        const response = await ctx.post('/v1/projects/not-an-ap-id/mcp-server/rotate')

        expect(response?.statusCode).toBeGreaterThanOrEqual(StatusCodes.BAD_REQUEST)
    })
})

describe('POST /v1/projects/:projectId/mcp-server/token', () => {
    /**
     * The raw `mcp_server.token` column is NOT the bearer credential. This route mints
     * a separate short-lived OAuth access token; conflating the two would hand out a
     * non-expiring secret.
     */
    it('issues an OAuth access token distinct from the stored mcp_server token', async () => {
        const ctx = await createTestContext(app!)
        const server = (await ctx.get(mcpUrl(ctx.project.id)))!.json()

        const response = await ctx.post(mcpUrl(ctx.project.id, '/token'))

        expect(response?.statusCode, response?.payload).toBe(StatusCodes.OK)
        const body = response!.json()
        expect(typeof body.mcpToken).toBe('string')
        expect(body.mcpToken.length).toBeGreaterThan(0)
        expect(body.mcpToken).not.toBe(server.token)
        expect(body.mcpServerUrl.endsWith('/mcp')).toBe(true)
    })

    /**
     * The token is a STATELESS JWT — `issueInternalAccessToken` signs and returns it
     * without writing a row. `mcp_oauth_token` stores only hashed *refresh* tokens
     * minted by the full `exchangeCode` OAuth flow, which is not mounted. Pinning
     * this stops a future reader from assuming a revocable server-side record exists.
     */
    it('mints a stateless short-lived token scoped to the project, persisting nothing', async () => {
        const ctx = await createTestContext(app!)

        const response = await ctx.post(mcpUrl(ctx.project.id, '/token'))

        expect(response?.statusCode, response?.payload).toBe(StatusCodes.OK)
        const claims = decodeJwtPayload(response!.json().mcpToken)
        expect(claims.projectId).toBe(ctx.project.id)
        expect(claims.platformId).toBe(ctx.platform.id)
        expect(claims.type).toBe('mcp_oauth')
        expect(claims.scopes).toEqual(['mcp'])
        expect(claims.exp - claims.iat).toBe(15 * 60)

        expect(await db.findManyBy('mcp_oauth_token', { projectId: ctx.project.id })).toHaveLength(0)
    })

    it('denies minting a token for another project', async () => {
        const victim = await createTestContext(app!)
        const attacker = await createTestContext(app!)

        const response = await attacker.post(mcpUrl(victim.project.id, '/token'))

        expect(response?.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('does not mint a token for a project that does not exist', async () => {
        const ctx = await createTestContext(app!)

        const response = await ctx.post(mcpUrl(apId(), '/token'))

        expect(response?.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
})

/** Reads the claims without verifying — the signature is the server's concern, not this test's. */
function decodeJwtPayload(token: string): McpTokenClaims {
    const payload = token.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
}

type McpTokenClaims = {
    projectId: string
    platformId: string
    type: string
    scopes: string[]
    exp: number
    iat: number
}
