import type { Client, UserObjectResponse } from '@notionhq/client'
import { describe, expect, it, vi } from 'vitest'
import { fetchAllNotionUsers } from './src/lib/common'

/**
 * Issue #186 — the people dropdown called `notion.users.list({ page_size: 100 })`
 * once, so any workspace with more than 100 users silently lost the rest. Notion
 * caps `page_size` at 100, so the only way to see everyone is to follow
 * `next_cursor`.
 */

type ListArgs = { page_size?: number, start_cursor?: string }

function person(id: string, name: string): UserObjectResponse {
    return { object: 'user', id, type: 'person', name } as unknown as UserObjectResponse
}

function bot(id: string): UserObjectResponse {
    return { object: 'user', id, type: 'bot', name: null } as unknown as UserObjectResponse
}

function clientReturning(pages: Array<{ results: UserObjectResponse[], has_more: boolean, next_cursor: string | null }>): {
    client: Client
    calls: ListArgs[]
} {
    const calls: ListArgs[] = []
    let index = 0
    const client = {
        users: {
            list: vi.fn(async (args: ListArgs) => {
                calls.push(args)
                const page = pages[Math.min(index, pages.length - 1)]
                index += 1
                return page
            }),
        },
    } as unknown as Client
    return { client, calls }
}

describe('fetchAllNotionUsers', () => {
    it('requests the maximum page size', async () => {
        const { client, calls } = clientReturning([
            { results: [person('u1', 'Ada')], has_more: false, next_cursor: null },
        ])

        await fetchAllNotionUsers(client)

        expect(calls[0].page_size).toBe(100)
    })

    it('returns every user when a single page is enough', async () => {
        const { client } = clientReturning([
            { results: [person('u1', 'Ada'), person('u2', 'Grace')], has_more: false, next_cursor: null },
        ])

        const users = await fetchAllNotionUsers(client)

        expect(users.map((u) => u.id)).toEqual(['u1', 'u2'])
    })

    it('follows next_cursor until has_more is false', async () => {
        const { client, calls } = clientReturning([
            { results: [person('u1', 'Ada')], has_more: true, next_cursor: 'c1' },
            { results: [person('u2', 'Grace')], has_more: true, next_cursor: 'c2' },
            { results: [person('u3', 'Alan')], has_more: false, next_cursor: null },
        ])

        const users = await fetchAllNotionUsers(client)

        expect(users.map((u) => u.id)).toEqual(['u1', 'u2', 'u3'])
        expect(calls).toHaveLength(3)
        expect(calls[0].start_cursor).toBeUndefined()
        expect(calls[1].start_cursor).toBe('c1')
        expect(calls[2].start_cursor).toBe('c2')
    })

    it('collects more than one page of users, which is the regression this fixes', async () => {
        const first = Array.from({ length: 100 }, (_, i) => person(`p${i}`, `User ${i}`))
        const second = Array.from({ length: 40 }, (_, i) => person(`q${i}`, `Other ${i}`))
        const { client } = clientReturning([
            { results: first, has_more: true, next_cursor: 'page-2' },
            { results: second, has_more: false, next_cursor: null },
        ])

        const users = await fetchAllNotionUsers(client)

        expect(users).toHaveLength(140)
    })

    it('drops bots and users with a null name, on every page', async () => {
        const { client } = clientReturning([
            { results: [person('u1', 'Ada'), bot('b1')], has_more: true, next_cursor: 'c1' },
            { results: [bot('b2'), person('u2', 'Grace')], has_more: false, next_cursor: null },
        ])

        const users = await fetchAllNotionUsers(client)

        expect(users.map((u) => u.id)).toEqual(['u1', 'u2'])
    })

    it('stops when has_more is true but next_cursor is null', async () => {
        const { client, calls } = clientReturning([
            { results: [person('u1', 'Ada')], has_more: true, next_cursor: null },
        ])

        const users = await fetchAllNotionUsers(client)

        expect(users).toHaveLength(1)
        expect(calls).toHaveLength(1)
    })

    it('breaks instead of looping forever when the API repeats a cursor', async () => {
        // Defensive: a non-advancing cursor would otherwise spin until the
        // request budget ran out.
        const { client, calls } = clientReturning([
            { results: [person('u1', 'Ada')], has_more: true, next_cursor: 'stuck' },
            { results: [person('u2', 'Grace')], has_more: true, next_cursor: 'stuck' },
        ])

        const users = await fetchAllNotionUsers(client)

        expect(calls).toHaveLength(2)
        expect(users.map((u) => u.id)).toEqual(['u1', 'u2'])
    })

    it('returns an empty list when the workspace has no users', async () => {
        const { client } = clientReturning([
            { results: [], has_more: false, next_cursor: null },
        ])

        expect(await fetchAllNotionUsers(client)).toEqual([])
    })

    it('propagates an API error rather than returning a partial list', async () => {
        const failing = {
            users: {
                list: vi.fn(async () => {
                    throw new Error('Notion API 500')
                }),
            },
        } as unknown as Client

        await expect(fetchAllNotionUsers(failing)).rejects.toThrow('Notion API 500')
    })
})
