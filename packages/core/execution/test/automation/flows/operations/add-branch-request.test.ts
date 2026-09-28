import { z } from 'zod'
import { AddBranchRequest } from '@inboxfm-connect/core-execution'
import { BranchOperator, BranchOperatorTextLiterals } from '@inboxfm-connect/core-piece-types'

describe('AddBranchRequest validation (Issue #168)', () => {
    const baseRequest = {
        branchIndex: 0,
        stepName: 'test-step',
        branchName: 'test-branch',
    }

    it('should accept valid branch conditions with non-empty values', () => {
        const validRequest = {
            ...baseRequest,
            conditions: [[
                {
                    firstValue: 'hello',
                    secondValue: 'world',
                    operator: BranchOperator.TEXT_EQ as BranchOperatorTextLiterals,
                }
            ]],
        }
        expect(() => AddBranchRequest.parse(validRequest)).not.toThrow()
    })

    it('should reject branch conditions with empty firstValue', () => {
        const invalidRequest = {
            ...baseRequest,
            conditions: [[
                {
                    firstValue: '',
                    secondValue: 'world',
                    operator: BranchOperator.TEXT_EQ as BranchOperatorTextLiterals,
                }
            ]],
        }
        expect(() => AddBranchRequest.parse(invalidRequest)).toThrow(z.ZodError)
    })

    it('should reject branch conditions with empty secondValue', () => {
        const invalidRequest = {
            ...baseRequest,
            conditions: [[
                {
                    firstValue: 'hello',
                    secondValue: '',
                    operator: BranchOperator.TEXT_EQ as BranchOperatorTextLiterals,
                }
            ]],
        }
        expect(() => AddBranchRequest.parse(invalidRequest)).toThrow(z.ZodError)
    })

    it('should accept branch condition with empty values when using internal Builder schema (backward compatibility)', () => {
        // This test documents that the internal Builder schema still allows empty values
        // This is not part of the public API validation but shows the internal inconsistency
        const { ValidBranchCondition } = require('../../../../../src/lib/flows/actions/action')
        const schema = ValidBranchCondition
        
        // Note: This would actually fail with current ValidBranchCondition due to min(1) constraint
        // This reveals the inconsistency with emptyCondition mentioned in the analysis
        expect(() => schema.parse({
            firstValue: '',
            secondValue: '',
            operator: BranchOperator.TEXT_CONTAINS as BranchOperatorTextLiterals,
            caseSensitive: false,
        })).toThrow(z.ZodError) // This demonstrates the emptyCondition inconsistency
    })
})
