import { FastifyBaseLogger } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { knowledgeSearchService } from '../../../../src/app/knowledge-search/knowledge-search.service'

const mockSearchActions = vi.hoisted(() => vi.fn())
const mockSearchTriggers = vi.hoisted(() => vi.fn())

vi.mock('../../../../src/app/tool-search/tool-search.service', () => ({
    toolSearchService: () => ({
        searchActions: mockSearchActions,
        searchTriggers: mockSearchTriggers,
    }),
}))

const mockLog = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
} as unknown as FastifyBaseLogger

function buildActionRow(overrides: Record<string, unknown> = {}) {
    return {
        pieceName: 'github',
        actionName: 'create_issue',
        displayName: 'Create Issue',
        oneLineDescription: 'Creates an issue',
        requiresConnection: true,
        cosine: 0.9,
        connected: true,
        ...overrides,
    }
}

function buildTriggerRow(overrides: Record<string, unknown> = {}) {
    return {
        pieceName: 'github',
        triggerName: 'new_issue',
        displayName: 'New Issue',
        oneLineDescription: 'Fires on new issues',
        requiresConnection: true,
        cosine: 0.8,
        connected: false,
        ...overrides,
    }
}

describe('knowledgeSearchService.query (issue #138)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('maps action results for the action filter without touching triggers', async () => {
        mockSearchActions.mockResolvedValue({ results: [buildActionRow()], mode: 'keyword' })
        const service = knowledgeSearchService(mockLog)
        const response = await service.query({ query: 'issue', objectKind: 'action', platformId: 'p1' })
        expect(mockSearchActions).toHaveBeenCalledTimes(1)
        expect(mockSearchTriggers).not.toHaveBeenCalled()
        expect(response).toEqual({
            results: [{
                pieceName: 'github',
                objectName: 'create_issue',
                objectKind: 'action',
                displayName: 'Create Issue',
                oneLineDescription: 'Creates an issue',
                requiresConnection: true,
                cosine: 0.9,
                connected: true,
            }],
            mode: 'keyword',
        })
    })

    it('maps trigger results for the trigger filter without touching actions', async () => {
        mockSearchTriggers.mockResolvedValue({ results: [buildTriggerRow()], mode: 'semantic' })
        const service = knowledgeSearchService(mockLog)
        const response = await service.query({ query: 'issue', objectKind: 'trigger', platformId: 'p1' })
        expect(mockSearchTriggers).toHaveBeenCalledTimes(1)
        expect(mockSearchActions).not.toHaveBeenCalled()
        expect(response.results[0]?.objectKind).toBe('trigger')
        expect(response.results[0]?.objectName).toBe('new_issue')
        expect(response.mode).toBe('semantic')
    })

    it('merges actions and triggers sorted by cosine for the all filter', async () => {
        mockSearchActions.mockResolvedValue({ results: [buildActionRow({ cosine: 0.5 })], mode: 'keyword' })
        mockSearchTriggers.mockResolvedValue({ results: [buildTriggerRow({ cosine: 0.95 })], mode: 'keyword' })
        const service = knowledgeSearchService(mockLog)
        const response = await service.query({ query: 'issue', platformId: 'p1' })
        expect(response.results.map((item) => item.objectName)).toEqual(['new_issue', 'create_issue'])
        expect(response.mode).toBe('keyword')
    })

    it('reports semantic mode when either side is semantic and slices to the limit', async () => {
        mockSearchActions.mockResolvedValue({
            results: [buildActionRow({ actionName: 'a1', cosine: 0.9 }), buildActionRow({ actionName: 'a2', cosine: 0.7 })],
            mode: 'semantic',
        })
        mockSearchTriggers.mockResolvedValue({ results: [buildTriggerRow({ cosine: 0.8 })], mode: 'keyword' })
        const service = knowledgeSearchService(mockLog)
        const response = await service.query({ query: 'issue', limit: 2, platformId: 'p1' })
        expect(response.results).toHaveLength(2)
        expect(response.results.map((item) => item.objectName)).toEqual(['a1', 'new_issue'])
        expect(response.mode).toBe('semantic')
    })

    it('caps combined results at the default limit of five', async () => {
        mockSearchActions.mockResolvedValue({
            results: [0, 1, 2, 3].map((index) => buildActionRow({ actionName: `a${index}`, cosine: 0.9 - index * 0.01 })),
            mode: 'keyword',
        })
        mockSearchTriggers.mockResolvedValue({
            results: [0, 1, 2, 3].map((index) => buildTriggerRow({ triggerName: `t${index}`, cosine: 0.5 - index * 0.01 })),
            mode: 'keyword',
        })
        const service = knowledgeSearchService(mockLog)
        const response = await service.query({ query: 'issue', platformId: 'p1' })
        expect(response.results).toHaveLength(5)
    })
})
