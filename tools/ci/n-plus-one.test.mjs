import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { findNPlusOneSites } from './check-n-plus-one.mjs'

const scan = (source, file = 'sample.ts') => findNPlusOneSites({ file, source })

describe('check-n-plus-one', () => {
    it('flags an awaited repository query inside a for-of loop', () => {
        const sites = scan(`
            async function load(ids) {
                const out = []
                for (const id of ids) {
                    out.push(await thingRepo().findOneBy({ id }))
                }
                return out
            }
        `)
        assert.equal(sites.length, 1)
        assert.match(sites[0].snippet, /findOneBy/)
    })

    it('flags the same pattern in a classic for loop', () => {
        const sites = scan(`
            async function load(ids) {
                for (let i = 0; i < ids.length; i++) {
                    await thingRepo().findBy({ id: ids[i] })
                }
            }
        `)
        assert.equal(sites.length, 1)
    })

    it('flags an awaited service call taking arguments', () => {
        const sites = scan(`
            async function load(ids, log) {
                for (const id of ids) {
                    await userService(log).getOneOrFail({ id })
                }
            }
        `)
        assert.equal(sites.length, 1)
        assert.match(sites[0].snippet, /getOneOrFail/)
    })

    it('flags a query nested deeper inside the loop body', () => {
        const sites = scan(`
            async function load(ids) {
                for (const id of ids) {
                    if (id) {
                        try {
                            await thingRepo().findOne({ id })
                        }
                        catch {}
                    }
                }
            }
        `)
        assert.equal(sites.length, 1)
    })

    it('flags a while-loop query', () => {
        const sites = scan(`
            async function drain(queue) {
                while (queue.length) {
                    await thingRepo().findOne({ id: queue.pop() })
                }
            }
        `)
        assert.equal(sites.length, 1)
    })

    // The batched form is what the rule pushes people towards, so it must not be flagged.
    it('does NOT flag Promise.all over the loop body', () => {
        const sites = scan(`
            async function load(ids) {
                return await Promise.all(ids.map((id) => thingRepo().findOne({ id })))
            }
        `)
        assert.equal(sites.length, 0)
    })

    it('does not flag a hoist above the loop', () => {
        const sites = scan(`
            async function load(ids) {
                const rows = await thingRepo().findBy({ id: In(ids) })
                for (const row of rows) {
                    process(row)
                }
            }
        `)
        assert.equal(sites.length, 0)
    })

    it('does not flag a non-query method on a repo accessor', () => {
        const sites = scan(`
            async function load(ids) {
                for (const id of ids) {
                    await thingRepo().invalidate()
                }
            }
        `)
        assert.equal(sites.length, 0)
    })

    it('does not flag a plain object method with the same name', () => {
        const sites = scan(`
            async function load(ids) {
                for (const id of ids) {
                    await cache.findOne({ id })
                }
            }
        `)
        assert.equal(sites.length, 0)
    })

    // A closure is not executed per iteration, so flagging it would be a false positive.
    it('does not flag an awaited query inside a nested closure', () => {
        const sites = scan(`
            async function load(ids) {
                for (const id of ids) {
                    await Promise.all(ids.map(async (other) => {
                        await thingRepo().findOne({ id: other })
                    }))
                }
            }
        `)
        assert.equal(sites.length, 0)
    })

    it('does not flag a nested loop, which is reported on its own', () => {
        const sites = scan(`
            async function load(rows) {
                for (const row of rows) {
                    for (const cell of row.cells) {
                        await thingRepo().findOne({ id: cell })
                    }
                }
            }
        `)
        // The inner loop is the site; the outer one is skipped so it is not double-counted.
        assert.equal(sites.length, 1)
    })

    it('returns nothing for a loop with no query', () => {
        const sites = scan(`
            export function total(numbers) {
                let sum = 0
                for (const n of numbers) {
                    sum += n
                }
                return sum
            }
        `)
        assert.equal(sites.length, 0)
    })

    it('reports the line the query is on', () => {
        const sites = scan([
            'async function load(ids) {',
            '    for (const id of ids) {',
            '        await thingRepo().findOne({ id })',
            '    }',
            '}',
        ].join('\n'))
        assert.equal(sites.length, 1)
        assert.equal(sites[0].line, 3)
    })

    // A service whose accessor was bound to a local earlier in the function still reaches
    // the database once per row - `user-invitation.service.ts:164` is exactly this shape.
    it('flags a call on a service bound to a local variable', () => {
        const sites = scan(`
            async function load(ids) {
                const projectRoleService = getProjectRoleService()
                for (const id of ids) {
                    await projectRoleService.getOneOrThrowById({ id })
                }
            }
        `)
        assert.equal(sites.length, 1)
    })

    // The allowlist-inversion fix: these three all sit in the same per-invitation loop in
    // user-invitation.service.ts and were missed by the original allowlist.
    it('flags domain-specific query methods not on any known list', () => {
        for (const method of ['getOneWithPlanOrThrow', 'getOrCreateWithProject', 'findWithCount']) {
            const sites = scan(`
                async function load(ids) {
                    for (const id of ids) {
                        await thingService(log).${method}({ id })
                    }
                }
            `)
            assert.equal(sites.length, 1, method)
        }
    })

    it('still does not flag known non-query operations', () => {
        for (const method of ['invalidate', 'clear', 'withTransaction']) {
            const sites = scan(`
                async function load(ids, thingRepo) {
                    for (const id of ids) {
                        await thingRepo().${method}()
                    }
                }
            `)
            assert.equal(sites.length, 0, method)
        }
    })

    it('keys the baseline by method so line drift does not re-report a site', () => {
        const sites = scan(`
            async function load(ids) {
                for (const id of ids) {
                    await thingRepo().findOneBy({ id })
                }
            }
        `)
        assert.equal(sites.length, 1)
        assert.equal(sites[0].method, 'findOneBy')
    })

    // A single loop can make several per-row calls. Reporting only the first one
    // understated the debt: user-invitation.service.ts makes six inside one for-of.
    it('reports every per-row query in a loop body, not just the first', () => {
        const sites = scan(`
            async function load(ids) {
                for (const id of ids) {
                    const a = await thingService(log).getOneWithPlanOrThrow(id)
                    const b = await thingService(log).exists({ id })
                    await thingService(log).upsert({ id })
                }
            }
        `)
        assert.equal(sites.length, 3)
        assert.deepEqual(sites.map((s) => s.method).sort(),
            ['exists', 'getOneWithPlanOrThrow', 'upsert'])
    })

    it('reports each line distinctly for reporting purposes', () => {
        const sites = scan([
            'async function load(ids) {',
            '    for (const id of ids) {',
            '        await thingRepo().findOne({ id })',
            '        await thingRepo().findOneBy({ id })',
            '    }',
            '}',
        ].join('\n'))
        assert.equal(sites.length, 2)
        assert.deepEqual(sites.map((s) => s.line), [3, 4])
    })
})
