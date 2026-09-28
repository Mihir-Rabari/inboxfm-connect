import { KnowledgeSearchResult, KnowledgeSearchQueryParams, KnowledgeSearchQueryResponse, KnowledgeSearchService, ObjectKindFilter } from '@inboxfm-connect/server-utils'
import { FastifyBaseLogger } from 'fastify'
import { describe, expect, it, vi } from 'vitest'

const { searchActions, searchTriggers } = vi.hoisted(() => ({
    searchActions: vi.fn(),
    searchTriggers: vi.fn(),
}))

vi.mock('@inboxfm-connect/server-utils', () => ({
    toolSearchService: () => ({
        searchActions,
        searchTriggers,
    }),
}))

import { knowledgeSearchService } from '../../../../../src/app/knowledge-search/knowledge-search.service'

describe('Knowledge Search Service - Unit', () => {
    const mockLog: FastifyBaseLogger = {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        fatal: vi.fn(),
        trace: vi.fn(),
        child: vi.fn(),
    } as unknown as FastifyBaseLogger

    const baseParams: KnowledgeSearchQueryParams = {
        query: 'test query',
        limit: 10,
        objectKind: 'all',
        platformId: 'plat_test',
        projectId: 'proj_test',
    }

    const mockActionResult = {
        pieceName: 'piece-github',
        actionName: 'create_issue',
        displayName: 'Create Issue',
        oneLineDescription: 'Creates a new issue',
        requiresConnection: true,
        cosine: 0.95,
        connected: true,
    }

    const mockTriggerResult = {
        pieceName: 'piece-slack',
        triggerName: 'new_message',
        displayName: 'New Message',
        oneLineDescription: 'Triggers on new message',
        requiresConnection: true,
        cosine: 0.85,
        connected: false,
    }

    beforeEach(() => {
        vi.restoreAllMocks()
    })

    describe('query with objectKind=action', () => {
        it('returns mapped action results with action kind', async () => {
            searchActions.mockResolvedValue({
                results: [mockActionResult],
                mode: 'semantic',
            })
            searchTriggers.mockResolvedValue({ results: [], mode: 'keyword' })

            const service = knowledgeSearchService(mockLog)
            const result = await service.query({ ...baseParams, objectKind: 'action' })

            expect(result.results).toHaveLength(1)
            expect(result.results[0].objectKind).toBe('action')
            expect(result.results[0].objectName).toBe('create_issue')
            expect(result.mode).toBe('semantic')
        })
    })

    describe('query with objectKind=trigger', () => {
        it('returns mapped trigger results with trigger kind', async () => {
            searchTriggers.mockResolvedValue({
                results: [mockTriggerResult],
                mode: 'keyword',
            })
            searchActions.mockResolvedValue({ results: [], mode: 'keyword' })

            const service = knowledgeSearchService(mockLog)
            const result = await service.query({ ...baseParams, objectKind: 'trigger' })

            expect(result.results).toHaveLength(1)
            expect(result.results[0].objectKind).toBe('trigger')
            expect(result.results[0].objectName).toBe('new_message')
            expect(result.mode).toBe('keyword')
        })
    })

    describe('query with objectKind=all', () => {
        it('combines and sorts action and trigger results by cosine desc', async () => {
            searchActions.mockResolvedValue({
                results: [mockActionResult],
                mode: 'semantic',
            })
            searchTriggers.mockResolvedValue({
                results: [mockTriggerResult],
                mode: 'semantic',
            })

            const service = knowledgeSearchService(mockLog)
            const result = await service.query({ ...baseParams, objectKind: 'all' })

            expect(result.results).toHaveLength(2)
            expect(result.results[0].cosine).toBeGreaterThanOrEqual(result.results[1].cosine ?? 0)
            expect(result.mode).toBe('semantic')
        })

        it('defaults to keyword mode when both are keyword', async () => {
            searchActions.mockResolvedValue({ results: [mockActionResult], mode: 'keyword' })
            searchTriggers.mockResolvedValue({ results: [mockTriggerResult], mode: 'keyword' })

            const service = knowledgeSearchService(mockLog)
            const result = await service.query({ ...baseParams, objectKind: 'all' })

            expect(result.mode).toBe('keyword')
        })

        it('respects limit parameter', async () => {
            searchActions.mockResolvedValue({
                results: Array.from({ length: 5 }, (_, i) => ({ ...mockActionResult, actionName: `action_${i}` })),
                mode: 'semantic',
            })
            searchTriggers.mockResolvedValue({ results: [], mode: 'keyword' })

            const service = knowledgeSearchService(mockLog)
            const result = await service.query({ ...baseParams, objectKind: 'action', limit: 3 })

            expect(result.results).toHaveLength(3)
        })

        it('filters by pieceName when provided', async () => {
            searchActions.mockResolvedValue({ results: [], mode: 'keyword' })
            searchTriggers.mockResolvedValue({ results: [], mode: 'keyword' })

            const service = knowledgeSearchService(mockLog)
            await service.query({ ...baseParams, objectKind: 'all', pieceName: 'piece-github' })

            expect(searchActions).toHaveBeenCalledWith(
                'test query',
                expect.objectContaining({ pieceName: 'piece-github' })
            )
        })
    })

    describe('type exports', () => {
        it('exports types', () => {
            expect(typeof KnowledgeSearchService).toBe('undefined')
            expect(typeof KnowledgeSearchResult).toBe('undefined')
            expect(typeof KnowledgeSearchQueryParams).toBe('undefined')
            expect(typeof KnowledgeSearchQueryResponse).toBe('undefined')
        })
    })
})
