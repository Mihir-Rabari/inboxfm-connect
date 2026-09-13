import { Clock, Terminal } from 'lucide-react'
import { TimezoneSelect } from '@/components/automations/timezone-select'
import { Input } from '@/components/ui/input'
import { cronUtils, ScheduleInterpretation } from '@/lib/utils/cron'
import { cn } from '@/lib/utils/cn'

export interface ScheduleBuilderProps {
  idPrefix: string
  cronExpression: string
  timezone: string
  onCronChange: (expression: string) => void
  onTimezoneChange: (timezone: string) => void
  interpretation: ScheduleInterpretation
  disabled?: boolean
}

export function ScheduleBuilder({
  idPrefix,
  cronExpression,
  timezone,
  onCronChange,
  onTimezoneChange,
  interpretation,
  disabled = false,
}: ScheduleBuilderProps) {
  const activePreset = cronUtils.presets.find((preset) => preset.expression === cronExpression.trim())

  return (
    <div className="space-y-4" data-testid="schedule-builder">
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium text-foreground">Preset schedule</legend>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Schedule presets">
          {cronUtils.presets.map((preset) => {
            const active = activePreset?.label === preset.label
            return (
              <button
                key={preset.label}
                type="button"
                disabled={disabled}
                title={`${preset.expression} — ${preset.description}`}
                onClick={() => onCronChange(preset.expression)}
                aria-pressed={active}
                className={cn(
                  'rounded-full border px-3 py-1 text-[11px] font-medium transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                  active
                    ? 'border-primary/50 bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                )}
              >
                {preset.label}
              </button>
            )
          })}
          {!activePreset && cronExpression.trim() !== '' && (
            <span className="rounded-full border border-dashed border-border px-3 py-1 text-[11px] font-medium text-muted-foreground">
              Custom
            </span>
          )}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-cron`} className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          Cron expression
        </label>
        <Input
          id={`${idPrefix}-cron`}
          type="text"
          spellCheck={false}
          disabled={disabled}
          value={cronExpression}
          onChange={(event) => onCronChange(event.target.value)}
          placeholder="0 8 * * *"
          aria-invalid={!interpretation.valid || undefined}
          aria-describedby={
            interpretation.description ? `${idPrefix}-cron-description` : undefined
          }
          className={cn('max-w-[220px] font-mono text-xs', !interpretation.valid && 'border-destructive focus-visible:ring-destructive/40')}
        />
        {interpretation.description && (
          <p
            id={`${idPrefix}-cron-description`}
            data-testid="cron-description"
            className="flex items-center gap-1.5 text-[11px] leading-relaxed text-muted-foreground"
          >
            <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>
              <code className="font-mono">{cronExpression.trim()}</code> → {interpretation.description}
            </span>
          </p>
        )}
        {interpretation.error && (
          <p role="alert" className="text-[11px] font-medium text-destructive">
            {interpretation.error}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-timezone`} className="text-xs font-medium text-foreground">
          Timezone
        </label>
        <TimezoneSelect
          id={`${idPrefix}-timezone`}
          value={timezone}
          onChange={onTimezoneChange}
          disabled={disabled}
        />
      </div>

      {interpretation.valid && (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground" data-testid="schedule-summary">
          <span className="font-semibold text-foreground">Schedule:</span>{' '}
          {interpretation.description ?? cronExpression.trim()}{' '}
          <span className="mx-1 text-border">|</span>
          <span className="font-semibold text-foreground">Timezone:</span>{' '}
          <code className="font-mono">{timezone}</code>
        </div>
      )}
    </div>
  )
}
