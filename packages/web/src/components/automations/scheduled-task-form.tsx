import { ArrowLeft, CalendarClock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ScheduleBuilder } from '@/components/automations/schedule-builder'
import { timezoneUtils } from '@/components/automations/timezone-select'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import {
  AutomationStatus,
  CreateScheduledTaskRequest,
  ScheduledTask,
  UpdateScheduledTaskRequest,
} from '@/lib/api/types'
import { cronUtils } from '@/lib/utils/cron'
import { executionErrors } from '@/lib/utils/execution-errors'
import {
  useCreateScheduledTask,
  useUpdateScheduledTask,
} from '@/lib/query/hooks'
import { cn } from '@/lib/utils/cn'

export interface ScheduledTaskFormProps {
  mode: 'create' | 'edit'
  task?: ScheduledTask
}

function initialTimezone(task?: ScheduledTask): string {
  if (task?.timezone) {
    return task.timezone
  }
  return timezoneUtils.browserTimezone() ?? 'UTC'
}

export function ScheduledTaskForm({ mode, task }: ScheduledTaskFormProps) {
  const navigate = useNavigate()
  const createMutation = useCreateScheduledTask()
  const updateMutation = useUpdateScheduledTask()

  const [prompt, setPrompt] = useState(task?.prompt ?? '')
  const [cronExpression, setCronExpression] = useState(task?.cronExpression ?? '0 8 * * *')
  const [timezone, setTimezone] = useState(initialTimezone(task))
  const [status, setStatus] = useState<AutomationStatus>(task?.status ?? 'ENABLED')
  const [errors, setErrors] = useState<{ prompt?: string; general?: string }>({})

  const initializedRef = useRef(mode === 'create')
  useEffect(() => {
    if (mode !== 'edit' || !task || initializedRef.current) {
      return
    }
    initializedRef.current = true
    setPrompt(task.prompt)
    setCronExpression(task.cronExpression)
    setTimezone(task.timezone)
    setStatus(task.status)
  }, [mode, task])

  const interpretation = cronUtils.interpretCronExpression(cronExpression)
  const isSubmitting = createMutation.isPending || updateMutation.isPending

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    let promptError: string | undefined
    if (prompt.trim() === '') {
      promptError = 'An instruction is required.'
    }
    if (!interpretation.valid) {
      toast.error('Fix the schedule before saving.', {
        description: interpretation.error,
      })
      setErrors({ prompt: promptError })
      return
    }
    if (promptError) {
      setErrors({ prompt: promptError })
      return
    }

    try {
      if (mode === 'create') {
        const request: CreateScheduledTaskRequest = {
          prompt: prompt.trim(),
          cronExpression: cronExpression.trim(),
          timezone,
          status,
        }
        const created = await createMutation.mutateAsync(request)
        toast.success('Scheduled task created')
        navigate(`/automations/schedules/${created.id}`)
      } else if (task) {
        const request: UpdateScheduledTaskRequest = {
          prompt: prompt.trim(),
          cronExpression: cronExpression.trim(),
          timezone,
          status,
        }
        await updateMutation.mutateAsync({ id: task.id, request })
        toast.success('Scheduled task updated')
        navigate(`/automations/schedules/${task.id}`)
      }
    } catch (mutationError) {
      setErrors({
        general: executionErrors.describe(mutationError, 'The scheduled task could not be saved.'),
      })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={mode === 'create' ? 'Create Scheduled Task' : 'Edit Scheduled Task'}
        description="Run an instruction automatically on a cron schedule. HeadlessRuntime executes it in the configured timezone."
        breadcrumbs={[
          { label: 'Automations', href: '/automations/schedules' },
          { label: 'Scheduled Tasks', href: '/automations/schedules' },
          { label: mode === 'create' ? 'New' : task?.id.slice(0, 8) ?? 'Edit' },
        ]}
        actions={
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link to={mode === 'edit' && task ? `/automations/schedules/${task.id}` : '/automations/schedules'}>
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Link>
          </Button>
        }
      />

      <form onSubmit={(event) => void handleSubmit(event)} noValidate className="max-w-3xl space-y-4">
        <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-xs" aria-label="Instruction">
          <div className="flex items-baseline gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground" aria-hidden="true">1</span>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Instruction</h2>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                What should run each time the schedule fires. Describe the tools to call and what to do with their output.
              </p>
            </div>
          </div>
          <label htmlFor="schedule-prompt" className="sr-only">
            Instruction
          </label>
          <textarea
            id="schedule-prompt"
            rows={4}
            value={prompt}
            disabled={isSubmitting}
            onChange={(event) => {
              setPrompt(event.target.value)
              setErrors((current) => ({ ...current, prompt: undefined }))
            }}
            placeholder={'Summarize my unread inbox and post the digest to the #updates Slack channel.'}
            aria-invalid={!!errors.prompt || undefined}
            aria-describedby={errors.prompt ? 'schedule-prompt-error' : undefined}
            className={cn(
              'w-full rounded-md border border-input bg-muted/20 px-3 py-2 text-xs shadow-xs transition-colors placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
              errors.prompt && 'border-destructive'
            )}
            data-testid="schedule-prompt-input"
          />
          {errors.prompt && (
            <p id="schedule-prompt-error" role="alert" className="text-[11px] font-medium text-destructive">
              {errors.prompt}
            </p>
          )}
        </section>

        <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-xs" aria-label="Schedule">
          <div className="flex items-baseline gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground" aria-hidden="true">2</span>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Schedule</h2>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                Pick a preset or write raw cron. The expression is never rewritten silently.
              </p>
            </div>
          </div>
          <ScheduleBuilder
            idPrefix="schedule"
            cronExpression={cronExpression}
            timezone={timezone}
            onCronChange={setCronExpression}
            onTimezoneChange={setTimezone}
            interpretation={interpretation}
            disabled={isSubmitting}
          />
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-xs" aria-label="Status">
          <div className="flex items-baseline gap-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground" aria-hidden="true">3</span>
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Status</h2>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">Disabled tasks keep their configuration but never fire.</p>
            </div>
          </div>
          <div className="inline-flex overflow-hidden rounded-lg border border-border" role="group" aria-label="Task status">
            {(['ENABLED', 'DISABLED'] as AutomationStatus[]).map((option) => (
              <button
                key={option}
                type="button"
                disabled={isSubmitting}
                aria-pressed={status === option}
                onClick={() => setStatus(option)}
                data-testid={`status-${option.toLowerCase()}`}
                className={cn(
                  'px-4 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
                  status === option
                    ? option === 'ENABLED'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      : 'bg-muted text-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground'
                )}
              >
                {option === 'ENABLED' ? 'Enabled' : 'Disabled'}
              </button>
            ))}
          </div>
        </section>

        {errors.general && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive" data-testid="form-general-error">
            {errors.general}
          </p>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-4">
          <Button
            type="submit"
            size="sm"
            loading={isSubmitting}
            disabled={isSubmitting}
            className="gap-1.5 font-semibold"
            data-testid="submit-schedule"
          >
            {!isSubmitting && <CalendarClock className="h-3.5 w-3.5" />}
            <span>{mode === 'create' ? 'Create Scheduled Task' : 'Save Changes'}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSubmitting}
            onClick={() =>
              navigate(mode === 'edit' && task ? `/automations/schedules/${task.id}` : '/automations/schedules')
            }
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
