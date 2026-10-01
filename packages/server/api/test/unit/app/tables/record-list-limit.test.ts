import { describe, expect, it } from 'vitest'

import { clampRecordListLimit } from '../../../../src/app/tables/record/record.service'

describe('clampRecordListLimit (issue #400)', () => {
    it('defaults to 10 when limit is absent or non-finite', () => {
        expect(clampRecordListLimit(undefined)).toBe(10)
        expect(clampRecordListLimit(Number.NaN)).toBe(10)
        expect(clampRecordListLimit(Number.POSITIVE_INFINITY)).toBe(10)
    })

    it('clamps to 1 when limit is below the minimum', () => {
        expect(clampRecordListLimit(0)).toBe(1)
        expect(clampRecordListLimit(-5)).toBe(1)
    })

    it('caps unbounded page sizes at 500 (the DoS vector)', () => {
        expect(clampRecordListLimit(999999999)).toBe(500)
        expect(clampRecordListLimit(501)).toBe(500)
    })

    it('keeps in-range values and floors non-integers', () => {
        expect(clampRecordListLimit(25)).toBe(25)
        expect(clampRecordListLimit(25.7)).toBe(25)
    })
})
