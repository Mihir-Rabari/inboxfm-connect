import { isNil } from '@inboxfm-connect/core-utils'
import { z } from 'zod'
import { mcpServerRepository } from './mcp-service'

async function findServerRow({ projectId }: { projectId: string }) {
    return mcpServerRepository().findOneBy({ projectId })
}

export const mcpMirrorState = {
    // Mirror-safe export for project promotion (#51): type plus disabled tools only.
    // Bearer tokens must never cross trust boundaries, so the token column is not
    // selected into this shape by construction — there is no field to leak.
    // Read-only on purpose: rotation and apply stay deferred until the #55 plan
    // envelope lands, and unlike getByProjectId this never lazily creates a row.
    exportForProject: async ({ projectId }: { projectId: string }): Promise<McpMirrorState> => {
        const row = await findServerRow({ projectId })
        if (isNil(row)) {
            return { projectId, configured: false, type: null, disabledTools: [] }
        }
        return { projectId, configured: true, type: row.type, disabledTools: row.disabledTools ?? [] }
    },
}

export const McpMirrorState = z.object({
    projectId: z.string(),
    configured: z.boolean(),
    type: z.string().nullable(),
    disabledTools: z.array(z.string()),
})
export type McpMirrorState = z.infer<typeof McpMirrorState>
