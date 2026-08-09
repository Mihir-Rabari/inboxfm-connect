import { FastifyBaseLogger } from 'fastify'
import { ToolSearchEmbedder } from '../tool-search/embedder'
import { toolSearchService } from '../tool-search/tool-search.service'

/**
 * Knowledge Search Service — First-class AI runtime capability for tool & integration discovery.
 * Wraps toolSearchService into a unified domain API for the AI planner and HTTP runtime callers.
 */
export const knowledgeSearchService = (log: FastifyBaseLogger): KnowledgeSearchService => ({
    async query(params: KnowledgeSearchQueryParams): Promise<KnowledgeSearchQueryResponse> {
        const { query, limit, pieceName, objectKind = 'all', audiences, platformId, projectId, embedder } = params

        if (objectKind === 'action') {
            const { results, mode } = await toolSearchService(log).searchActions(query, {
                platformId,
                projectId,
                limit,
                pieceName,
                audiences,
                embedder,
            })
            const mappedResults: KnowledgeSearchResult[] = results.map((item) => ({
                pieceName: item.pieceName,
                objectName: item.actionName,
                objectKind: 'action',
                displayName: item.displayName,
                oneLineDescription: item.oneLineDescription,
                requiresConnection: item.requiresConnection,
                cosine: item.cosine,
                connected: item.connected,
            }))
            return { results: mappedResults, mode }
        }

        if (objectKind === 'trigger') {
            const { results, mode } = await toolSearchService(log).searchTriggers(query, {
                platformId,
                projectId,
                limit,
                pieceName,
                embedder,
            })
            const mappedResults: KnowledgeSearchResult[] = results.map((item) => ({
                pieceName: item.pieceName,
                objectName: item.triggerName,
                objectKind: 'trigger',
                displayName: item.displayName,
                oneLineDescription: item.oneLineDescription,
                requiresConnection: item.requiresConnection,
                cosine: item.cosine,
                connected: item.connected,
            }))
            return { results: mappedResults, mode }
        }

        const [actionsRes, triggersRes] = await Promise.all([
            toolSearchService(log).searchActions(query, {
                platformId,
                projectId,
                limit,
                pieceName,
                audiences,
                embedder,
            }),
            toolSearchService(log).searchTriggers(query, {
                platformId,
                projectId,
                limit,
                pieceName,
                embedder,
            }),
        ])

        const actionItems: KnowledgeSearchResult[] = actionsRes.results.map((item) => ({
            pieceName: item.pieceName,
            objectName: item.actionName,
            objectKind: 'action',
            displayName: item.displayName,
            oneLineDescription: item.oneLineDescription,
            requiresConnection: item.requiresConnection,
            cosine: item.cosine,
            connected: item.connected,
        }))

        const triggerItems: KnowledgeSearchResult[] = triggersRes.results.map((item) => ({
            pieceName: item.pieceName,
            objectName: item.triggerName,
            objectKind: 'trigger',
            displayName: item.displayName,
            oneLineDescription: item.oneLineDescription,
            requiresConnection: item.requiresConnection,
            cosine: item.cosine,
            connected: item.connected,
        }))

        const combined = [...actionItems, ...triggerItems]
        combined.sort((a, b) => {
            const scoreA = a.cosine ?? 0
            const scoreB = b.cosine ?? 0
            return scoreB - scoreA
        })

        const maxLimit = limit ?? DEFAULT_SEARCH_LIMIT
        const mode = actionsRes.mode === 'semantic' || triggersRes.mode === 'semantic' ? 'semantic' : 'keyword'

        return {
            results: combined.slice(0, maxLimit),
            mode,
        }
    },
})

const DEFAULT_SEARCH_LIMIT = 5

export type ObjectKindFilter = 'action' | 'trigger' | 'all'

export type KnowledgeSearchResult = {
    pieceName: string
    objectName: string
    objectKind: 'action' | 'trigger'
    displayName: string
    oneLineDescription?: string
    requiresConnection: boolean
    cosine?: number
    connected?: boolean
}

export type KnowledgeSearchQueryParams = {
    query: string
    limit?: number
    objectKind?: ObjectKindFilter
    pieceName?: string
    audiences?: string[]
    platformId?: string
    projectId?: string
    embedder?: ToolSearchEmbedder | null
}

export type KnowledgeSearchQueryResponse = {
    results: KnowledgeSearchResult[]
    mode: 'semantic' | 'keyword'
}

export type KnowledgeSearchService = {
    query(params: KnowledgeSearchQueryParams): Promise<KnowledgeSearchQueryResponse>
}
