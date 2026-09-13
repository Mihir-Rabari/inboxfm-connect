import { useParams } from 'react-router-dom'
import { TriggerBindingForm } from '@/components/automations/trigger-binding-form'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { executionErrors } from '@/lib/utils/execution-errors'
import { useTriggerBindingQuery } from '@/lib/query/hooks'

export default function EditTriggerBindingPage() {
  const { id } = useParams<{ id: string }>()
  const bindingQuery = useTriggerBindingQuery(id)

  if (bindingQuery.isLoading) {
    return (
      <div className="max-w-3xl space-y-4" aria-hidden="true">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    )
  }

  if (bindingQuery.isError || !bindingQuery.data) {
    return (
      <ErrorState
        title="Trigger binding not found"
        description={executionErrors.describe(
          bindingQuery.error,
          'This binding may have been deleted or belongs to another project.'
        )}
        onRetry={() => void bindingQuery.refetch()}
      />
    )
  }

  return <TriggerBindingForm mode="edit" binding={bindingQuery.data} />
}
