import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { AddBranchRequest } from '../../../src/lib/flows/operations'
import { BranchOperator, emptyCondition, ValidBranchCondition } from '../../../src/lib/flows/actions/action'

const base = {
    branchIndex: 0,
    stepName: 'step_1',
    branchName: 'branch-a',
}

describe('AddBranchRequest branch-condition validation (Issue #168)', () => {
    it('accepts a condition with non-empty values', () => {
        const parsed = AddBranchRequest.parse({
            ...base,
            conditions: [[
                {
                    firstValue: '{{trigger.body.name}}',
                    secondValue: 'expected',
                    operator: BranchOperator.TEXT_EXACTLY_MATCHES,
                },
            ]],
        })
        expect(parsed.conditions?.[0][0].firstValue).toBe('{{trigger.body.name}}')
    })

    /**
     * The import path used the lax `BranchCondition` (no min length), so a
     * flow could be imported carrying an empty `firstValue` — a condition the
     * builder's strict schema then refuses, leaving the flow unrunnable and
     * unfixable in the UI. `AddBranchRequest` is the validation gate for that
     * path, so these pin the strict behaviour.
     */
    it('rejects a condition with an empty firstValue', () => {
        const result = AddBranchRequest.safeParse({
            ...base,
            conditions: [[
                { firstValue: '', secondValue: 'expected', operator: BranchOperator.TEXT_EXACTLY_MATCHES },
            ]],
        })
        expect(result.success).toBe(false)
    })

    it('rejects a condition with an empty secondValue', () => {
        const result = AddBranchRequest.safeParse({
            ...base,
            conditions: [[
                { firstValue: 'actual', secondValue: '', operator: BranchOperator.TEXT_EXACTLY_MATCHES },
            ]],
        })
        expect(result.success).toBe(false)
    })

    it('rejects a branch whose every condition is empty', () => {
        const result = AddBranchRequest.safeParse({
            ...base,
            conditions: [[{ firstValue: '', secondValue: '', operator: BranchOperator.TEXT_CONTAINS }]],
        })
        expect(result.success).toBe(false)
    })

    it('still allows omitting conditions entirely', () => {
        const parsed = AddBranchRequest.parse({ ...base })
        expect(parsed.conditions).toBeUndefined()
    })
})

/**
 * Documents a pre-existing inconsistency surfaced while making this change:
 * `emptyCondition` is annotated `ValidBranchCondition`, but its empty
 * firstValue/secondValue do not satisfy that schema's `.min(1)`. It is the
 * builder's "new, not yet configured" placeholder and is only ever persisted
 * through the lax internal path, so this is not fixed here - but it is pinned
 * so the annotation cannot drift further from reality unnoticed.
 */
describe('emptyCondition vs ValidBranchCondition', () => {
    it('is annotated ValidBranchCondition but does not parse as one', () => {
        expect(emptyCondition.firstValue).toBe('')
        expect(emptyCondition.secondValue).toBe('')
        expect(ValidBranchCondition.safeParse(emptyCondition).success).toBe(false)
    })

    it('parses once its values are filled in', () => {
        expect(ValidBranchCondition.safeParse({
            ...emptyCondition,
            firstValue: 'a',
            secondValue: 'b',
        }).success).toBe(true)
    })
})

describe('ValidBranchCondition shape', () => {
    it('rejects a non-string firstValue', () => {
        expect(ValidBranchCondition.safeParse({ firstValue: 1, secondValue: 'b' }).success).toBe(false)
    })

    it('accepts an operator-less condition when both values are present', () => {
        expect(ValidBranchCondition.safeParse({ firstValue: 'a', secondValue: 'b' }).success).toBe(true)
    })

    it('is a zod schema, so failures surface as ZodError', () => {
        expect(() => AddBranchRequest.parse({
            ...base,
            conditions: [[{ firstValue: '', secondValue: '' }]],
        })).toThrow(z.ZodError)
    })
})
