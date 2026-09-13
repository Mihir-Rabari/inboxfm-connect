import { Link } from 'react-router-dom'
import { CalendarClock, Pencil, Play, Trash2 } from 'lucide-react'
import { AutomationStatusBadge } from '@/components/automations/automation-status-badge'
import { Button } from '@/components/ui/button'
import { ScheduledTask } from '@/lib/api/types'
import { cronUtils } from '@/lib/utils/cron'

export interface ScheduledTaskTableProps {
  tasks: ScheduledTask[]
  runNowPendingId: string | null
  onRunNow: (task: ScheduledTask) => void
  onRequestDelete: (task: ScheduledTask) => void
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return '—'
  }
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ScheduledTaskTable({
  tasks,
  runNowPendingId,
  onRunNow,
  onRequestDelete,
}: ScheduledTaskTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs" data-testid="scheduled-task-table">
      <table className="w-full min-w-[760px] border-collapse text-left text-xs">
        <caption className="sr-only">Scheduled tasks</caption>
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="px-4 py-2.5 font-semibold">Task</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Schedule</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Last run</th>
            <th scope="col" className="px-4 py-2.5 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors" data-testid="scheduled-task-row">
              <td className="max-w-[280px] px-4 py-3">
                <Link to={`/automations/schedules/${task.id}`} className="group flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card">
                    <CalendarClock className="h-4 w-4 text-primary" />
                  </span>
                  <span className="block truncate font-semibold text-foreground group-hover:text-primary transition-colors" title={task.prompt}>
                    {task.prompt}
                  </span>
                </Link>
              </td>
              <td className="px-4 py-3">
                <code className="font-mono text-[11px] text-foreground">{task.cronExpression}</code>
                <span className="block text-[10px] text-muted-foreground">
                  {cronUtils.describeCronExpression(task.cronExpression) ?? 'Custom schedule'} · {task.timezone}
                </span>
              </td>
              <td className="px-4 py-3"><AutomationStatusBadge status={task.status} /></td>
              <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                {formatTimestamp(task.lastRunAt)}
                {task.nextRunAt && (
                  <span className="block text-[10px]">Next: {formatTimestamp(task.nextRunAt)}</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="outline"
                    size="xs"
                    disabled={runNowPendingId === task.id}
                    onClick={() => onRunNow(task)}
                    aria-label={`Run ${task.prompt} now`}
                    title="Run Now"
                    loading={runNowPendingId === task.id}
                    className="gap-1"
                  >
                    <Play className="h-3 w-3 text-primary" />
                    <span>Run Now</span>
                  </Button>
                  <Button variant="ghost" size="icon-xs" asChild className="text-muted-foreground hover:text-foreground" aria-label={`Edit ${task.prompt}`}>
                    <Link to={`/automations/schedules/${task.id}/edit`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRequestDelete(task)}
                    aria-label={`Delete ${task.prompt}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
