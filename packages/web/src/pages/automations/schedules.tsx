import { CalendarClock, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AutomationDeleteDialog } from '@/components/automations/automation-delete-dialog'
import { ScheduledTaskTable } from '@/components/automations/scheduled-task-table'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { ScheduledTask } from '@/lib/api/types'
import { executionErrors } from '@/lib/utils/execution-errors'
import {
  useDeleteScheduledTask,
  useRunScheduledTaskNow,
  useScheduledTasksQuery,
} from '@/lib/query/hooks'
export default function ScheduledTasksPage() {
  const navigate = useNavigate()
  const tasksQuery = useScheduledTasksQuery()
  const deleteMutation = useDeleteScheduledTask()
  const runNowMutation = useRunScheduledTaskNow()

  const [deleteTarget, setDeleteTarget] = useState<ScheduledTask | null>(null)

  const tasks = tasksQuery.data ?? []

  async function handleRunNow(task: ScheduledTask) {
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
    if (!deleteTarget) return
    try {
      await deleteMutation.mutateAsync({ id: deleteTarget.id })
      toast.success('Scheduled task deleted')
      setDeleteTarget(null)
    } catch (mutationError) {
      toast.error('Failed to delete scheduled task', {
        description: executionErrors.describe(mutationError, 'The task could not be deleted.'),
      })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scheduled Tasks"
        description="Cron-driven instructions executed automatically by the Headless scheduler."
        actions={
          <Button size="sm" asChild className="gap-1.5 shadow-xs" data-testid="create-schedule-button">
            <Link to="/automations/schedules/new">
              <Plus className="h-3.5 w-3.5" />
              <span>Create Scheduled Task</span>
            </Link>
          </Button>
        }
      />

      {tasksQuery.isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : tasksQuery.isError ? (
        <ErrorState
          title="Unable to load scheduled tasks"
          description={executionErrors.describe(
            tasksQuery.error,
            'The scheduler could not be reached. Retry shortly.'
          )}
          onRetry={() => void tasksQuery.refetch()}
        />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="No scheduled tasks configured"
          description="Create recurring cron tasks — daily summaries, hourly syncs, weekly digests — executed via HeadlessRuntime."
          actionLabel="Create Scheduled Task"
          actionIcon={Plus}
          onAction={() => navigate('/automations/schedules/new')}
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {tasks.length} task{tasks.length === 1 ? '' : 's'} configured
          </p>
          <ScheduledTaskTable
            tasks={tasks}
            runNowPendingId={
              runNowMutation.isPending ? runNowMutation.variables?.id ?? null : null
            }
            onRunNow={(task) => void handleRunNow(task)}
            onRequestDelete={setDeleteTarget}
          />
        </>
      )}

      <AutomationDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        kind="scheduled-task"
        label={deleteTarget?.prompt ?? ''}
        loading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}
