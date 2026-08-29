import cronstrue from 'cronstrue'
import { isValidCron } from 'cron-validator'

export interface CronPreset {
  label: string
  description: string
  expression: string
}

const CRON_PRESETS: CronPreset[] = [
  { label: 'Every minute', description: 'Runs once per minute', expression: '* * * * *' },
  { label: 'Every 5 minutes', description: 'Runs every 5 minutes', expression: '*/5 * * * *' },
  { label: 'Every hour', description: 'Runs at minute 0 of every hour', expression: '0 * * * *' },
  { label: 'Every day', description: 'Runs once per day', expression: '0 8 * * *' },
  { label: 'Every weekday', description: 'Runs Monday through Friday', expression: '0 9 * * 1-5' },
  { label: 'Every week', description: 'Runs once per week', expression: '0 9 * * 1' },
  { label: 'Every month', description: 'Runs on the first day of each month', expression: '0 9 1 * *' },
]

function validateCronExpression(expression: string): string | undefined {
  const trimmed = expression.trim()
  if (trimmed === '') {
    return 'Cron expression is required'
  }
  if (!isValidCron(trimmed, { seconds: false })) {
    return 'Invalid cron expression. Use a standard 5-field cron, e.g. "0 8 * * *"'
  }
  return undefined
}

function describeCronExpression(expression: string): string | undefined {
  if (validateCronExpression(expression) !== undefined) {
    return undefined
  }
  try {
    return cronstrue.toString(expression.trim())
  } catch {
    return undefined
  }
}

export interface ScheduleInterpretation {
  valid: boolean
  error?: string
  description?: string
}

function interpretCronExpression(expression: string): ScheduleInterpretation {
  const error = validateCronExpression(expression)
  if (error !== undefined) {
    return { valid: false, error }
  }
  return { valid: true, description: describeCronExpression(expression) }
}

export const cronUtils = {
  presets: CRON_PRESETS,
  validateCronExpression,
  describeCronExpression,
  interpretCronExpression,
}
