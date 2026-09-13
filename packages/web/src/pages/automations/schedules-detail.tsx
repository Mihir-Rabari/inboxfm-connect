import { ArrowLeft, Pencil, Play, Power, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AutomationDeleteDialog } from '@/components/automations/automation-delete-dialog'
import { AutomationStatusBadge } from '@/components/automations/automation-status-badge'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { AutomationStatus } from '@/lib/api/types'
import { cronUtils } from '@/lib/utils/cron'
import { executionErrors } from '@/lib/utils/execution-errors'
import {
  useDeleteScheduledTask,
  useRunScheduledTaskNow,
  useScheduledTaskQuery,
  useUpdateScheduledTask,
} from '@/lib/query/hooks'

export default function ScheduledTaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const taskQuery = useScheduledTaskQuery(id)
  const task = taskQuery.data

  const updateMutation = useUpdateScheduledTask()
  const deleteMutation = useDeleteScheduledTask()
  const runNowMutation = useRunScheduledTaskNow()

  const [deleteOpen, setDeleteOpen] = useState(false)

  if (taskQuery.isLoading) {
    return (
      <div className="max-w-3xl space-y-4" aria-hidden="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  if (taskQuery.isError || !task) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Scheduled Task"
          breadcrumbs={[
            { label: 'Automations', href: '/automations/schedules' },
            { label: id ?? '' },
          ]}
        />
        <ErrorState
          title="Scheduled task not found"
          description={executionErrors.describe(
            taskQuery.error,
            'This task may have been deleted or belongs to another project.'
          )}
          onRetry={() => void taskQuery.refetch()}
        />
        <div className="flex justify-center">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link to="/automations/schedules">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>All Scheduled Tasks</span>
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const description = cronUtils.describeCronExpression(task.cronExpression)

  async function handleToggleStatus() {
    if (!task) return
    const nextStatus: AutomationStatus = task.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
    try {
      await updateMutation.mutateAsync({ id: task.id, request: { status: nextStatus } })
      toast.success(nextStatus === 'ENABLED' ? 'Scheduled task enabled' : 'Scheduled task disabled')
    } catch (mutationError) {
      toast.error('Could not change the task status', {
        description: executionErrors.describe(mutationError, 'Try again in a moment.'),
      })
    }
  }

  async function handleRunNow() {
    if (!task) return
    try {
      const execution = await runNowMutation.mutateAsync({ id: task.id })
      toast.success('Scheduled task executed', {
        description: `Execution ${execution.id.slice(0, 8)}… created. Track it in Activity.`,
        action: {
          label: 'Inspect',
          onClick: () => navigate(`/activity/${execution.id}`),
        },
      })
    } catch (runError) {
      toast.error('Run failed', {
        description: executionErrors.describe(runError, 'The task could not be executed.'),
      })
    }
  }

  async function handleDelete() {
    if (!task) return
    try {
      await deleteMutation.mutateAsync({ id: task.id })
      toast.success('Scheduled task deleted')
      navigate('/automations/schedules')
    } catch (mutationError) {
      toast.error('Failed to delete scheduled task', {
        description: executionErrors.describe(mutationError, 'The task could not be deleted.'),
      })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={task.prompt.length > 64 ? `${task.prompt.slice(0, 64)}…` : task.prompt}
        description={description ? `${description} · ${task.timezone}` : undefined}
        breadcrumbs={[
          { label: 'Automations', href: '/automations/schedules' },
          { label: 'Scheduled Tasks', href: '/automations/schedules' },
          { label: task.id.slice(0, 8) },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link to={`/automations/schedules/${task.id}/edit`}>
                <Pencil className="h-3.5 w-3.5" />
                <span>Edit</span>
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={updateMutation.isPending}
              onClick={() => void handleToggleStatus()}
            >
              <Power className="h-3.5 w-3.5" />
              <span>{task.status === 'ENABLED' ? 'Disable' : 'Enable'}</span>
            </Button>
            <Button
              size="sm"
              loading={runNowMutation.isPending}
              onClick={() => void handleRunNow()}
              className="gap-1.5 font-semibold"
              data-testid="detail-run-now"
            >
              <Play className="h-3.5 w-3.5" />
              <span>Run Now</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </Button>
          </div>
        }
      />

      <section className="rounded-xl border border-border bg-card p-5 shadow-xs" aria-label="Task overview">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <code className="font-mono text-[11px] text-muted-foreground">{task.id}</code>
          <AutomationStatusBadge status={task.status} />
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 pt-4 sm:grid-cols-2" data-testid="schedule-overview">
          <Detail label="Schedule">
            <code className="font-mono text-xs text-foreground">{task.cronExpression}</code>
            {description && <span className="block text-[11px] text-muted-foreground">{description}</span>}
          </Detail>
          <Detail label="Timezone">
            <code className="font-mono text-xs text-foreground">{task.timezone}</code>
          </Detail>
          <Detail label="Created">
            <span className="text-xs text-foreground">{formatDateTime(task.created)}</span>
          </Detail>
          <Detail label="Updated">
            <span className="text-xs text-foreground">{formatDateTime(task.updated)}</span>
          </Detail>
          <Detail label="Last Run">
            <span className="text-xs text-foreground">
              {task.lastRunAt ? formatDateTime(task.lastRunAt) : 'Never'}
            </span>
          </Detail>
          {task.nextRunAt && (
            <Detail label="Next Run">
              <span className="text-xs text-foreground">{formatDateTime(task.nextRunAt)}</span>
            </Detail>
          )}
        </dl>

        <div className="mt-4 space-y-1.5 border-t border-border pt-4">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Instruction</dt>
          <dd>
            <p
              className="whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 text-xs leading-relaxed text-foreground"
              data-testid="schedule-detail-prompt"
            >
              {task.prompt}
            </p>
          </dd>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
          <Badge variant="outline" className="text-[10px]">
            Executed by HeadlessRuntime
          </Badge>
          <span className="text-[11px] text-muted-foreground">
            Runs create records visible under Activity.
          </span>
        </div>
      </section>

      <AutomationDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        kind="scheduled-task"
        label={task.prompt}
        loading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
