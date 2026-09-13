import { useParams } from 'react-router-dom'
import { ScheduledTaskForm } from '@/components/automations/scheduled-task-form'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { executionErrors } from '@/lib/utils/execution-errors'
import { useScheduledTaskQuery } from '@/lib/query/hooks'

export default function EditScheduledTaskPage() {
  const { id } = useParams<{ id: string }>()
  const taskQuery = useScheduledTaskQuery(id)

  if (taskQuery.isLoading) {
    return (
      <div className="max-w-3xl space-y-4" aria-hidden="true">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    )
  }

  if (taskQuery.isError || !taskQuery.data) {
    return (
      <ErrorState
        title="Scheduled task not found"
        description={executionErrors.describe(
          taskQuery.error,
          'This task may have been deleted or belongs to another project.'
        )}
        onRetry={() => void taskQuery.refetch()}
      />
    )
  }

  return <ScheduledTaskForm mode="edit" task={taskQuery.data} />
}
