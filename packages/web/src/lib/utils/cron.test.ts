import { describe, expect, it } from 'vitest'
import { cronUtils } from './cron'

describe('cronUtils', () => {
  describe('validateCronExpression', () => {
    it('accepts standard 5-field expressions', () => {
      expect(cronUtils.validateCronExpression('0 8 * * *')).toBeUndefined()
      expect(cronUtils.validateCronExpression('* * * * *')).toBeUndefined()
      expect(cronUtils.validateCronExpression('*/5 * * * *')).toBeUndefined()
      expect(cronUtils.validateCronExpression('0 9 * * 1-5')).toBeUndefined()
    })

    it('rejects malformed expressions with a helpful error', () => {
      expect(cronUtils.validateCronExpression('')).toContain('required')
      expect(cronUtils.validateCronExpression('not-a-cron')).toContain('Invalid cron')
      expect(cronUtils.validateCronExpression('61 * * * *')).toContain('Invalid cron')
    })
  })

  describe('describeCronExpression', () => {
    it('produces a human-readable interpretation for valid expressions', () => {
      const description = cronUtils.describeCronExpression('0 8 * * *')
      expect(description).toBeTruthy()
      expect(description?.toLowerCase()).toContain('8:00')
    })

    it('returns undefined for invalid expressions', () => {
      expect(cronUtils.describeCronExpression('garbage')).toBeUndefined()
      expect(cronUtils.describeCronExpression('')).toBeUndefined()
    })
  })

  describe('interpretCronExpression', () => {
    it('reports valid expressions with a description', () => {
      const result = cronUtils.interpretCronExpression('*/15 * * * *')
      expect(result.valid).toBe(true)
      expect(result.description).toBeTruthy()
      expect(result.error).toBeUndefined()
    })

    it('reports invalid expressions with an error and no description', () => {
      const result = cronUtils.interpretCronExpression('99 99 * * *')
      expect(result.valid).toBe(false)
      expect(result.error).toBeTruthy()
      expect(result.description).toBeUndefined()
    })
  })

  describe('presets', () => {
    it('ships developer-friendly presets whose expressions are all valid', () => {
      expect(cronUtils.presets.length).toBeGreaterThanOrEqual(7)
      for (const preset of cronUtils.presets) {
        expect(cronUtils.validateCronExpression(preset.expression)).toBeUndefined()
        expect(preset.label).toBeTruthy()
        expect(preset.description).toBeTruthy()
      }
    })
  })
})
