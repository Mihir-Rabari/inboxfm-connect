import { apId } from '@inboxfm-connect/core-utils'
import { FilteredPieceBehavior, McpServerType, PackageType, PieceType, ProjectScopedMcpServer } from '@inboxfm-connect/shared'
import { FastifyBaseLogger, FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apResearchPiecesTool } from '../../../../src/app/mcp/tools/ap-research-pieces'
import { pieceCache } from '../../../../src/app/pieces/metadata/piece-cache'
import { db } from '../../../helpers/db'
import { createMockPieceMetadata } from '../../../helpers/mocks'
import { createTestContext } from '../../../helpers/test-context'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance
let mockLog: FastifyBaseLogger

beforeAll(async () => {
    app = await setupTestEnvironment()
    mockLog = app.log
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('MCP piece visibility', () => {
    it('ap_research_pieces — does NOT return pieces hidden by platform admin (BLOCKED behavior)', async () => {
        const blockedPieceName = '@inboxfm-connect/piece-hidden-by-admin'

        const ctx = await createTestContext(app, {
            platform: {
                filteredPieceBehavior: FilteredPieceBehavior.BLOCKED,
                filteredPieceNames: [blockedPieceName],
            },
        })
        const mcp = makeMcp(ctx.project.id)

        const blockedPiece = createMockPieceMetadata({
            name: blockedPieceName,
            displayName: 'Hidden By Admin',
            version: '0.1.0',
            pieceType: PieceType.OFFICIAL,
            packageType: PackageType.REGISTRY,
            platformId: undefined,
            actions: {},
            triggers: {},
        })
        await db.save('integration_metadata', blockedPiece)
        await pieceCache(mockLog).setup()

        const result = await apResearchPiecesTool(mcp, mockLog).execute({})

        // The only seeded piece is blocked, so the correct successful result is "no pieces matched"
        // (a ⚠️ guidance message, not an ❌ error) — assert it succeeded and excludes the blocked piece.
        expect(text(result)).not.toContain('❌')
        expect(text(result)).not.toContain(blockedPieceName)
    })

    it('ap_research_pieces — returns pieces NOT in the platform blocklist', async () => {
        const visiblePieceName = '@inboxfm-connect/piece-visible'

        const ctx = await createTestContext(app, {
            platform: {
                filteredPieceBehavior: FilteredPieceBehavior.BLOCKED,
                filteredPieceNames: ['@inboxfm-connect/piece-something-else'],
            },
        })
        const mcp = makeMcp(ctx.project.id)

        const visiblePiece = createMockPieceMetadata({
            name: visiblePieceName,
            displayName: 'Visible Piece',
            version: '0.1.0',
            pieceType: PieceType.OFFICIAL,
            packageType: PackageType.REGISTRY,
            platformId: undefined,
            actions: {},
            triggers: {},
        })
        await db.save('integration_metadata', visiblePiece)
        await pieceCache(mockLog).setup()

        // Unscoped, this call ranks against the entire real ~700-piece shipped catalog
        // (LIST_CAP caps the unfiltered result to the first 50), so the seeded piece isn't
        // guaranteed a slot. Scope with a distinctive single-word searchQuery instead of
        // the full displayName: piece-searching.ts's substring-match union matches a query
        // token against the piece's own name too, and every real piece's name contains the
        // substring "piece" (e.g. "@inboxfm-connect/piece-slack") — a two-token query like
        // "Visible Piece" re-triggers the same catalog-wide match this fix is meant to avoid.
        // "Visible" alone is distinctive and an exact substring of the piece's displayName,
        // so it lands as a top Fuse match regardless of catalog size.
        const result = await apResearchPiecesTool(mcp, mockLog).execute({ searchQuery: 'Visible' })

        expect(text(result)).toContain('✅')
        expect(text(result)).toContain(visiblePieceName)
    })
})

function makeMcp(projectId: string): ProjectScopedMcpServer {
    return {
        id: apId(),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        projectId,
        platformId: null,
        type: McpServerType.PROJECT,
        token: apId(),
        disabledTools: null,
    }
}

function text(result: { content: Array<{ type: 'text', text: string }> }): string {
    return result.content.map(c => c.text).join('\n')
}
