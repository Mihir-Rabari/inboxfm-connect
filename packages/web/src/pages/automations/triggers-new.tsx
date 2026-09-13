import { TriggerBindingForm } from '@/components/automations/trigger-binding-form'
import { useSearchParams } from 'react-router-dom'

export default function NewTriggerBindingPage() {
  const [searchParams] = useSearchParams()
  return (
    <TriggerBindingForm
      mode="create"
      defaultPieceName={searchParams.get('pieceName') ?? undefined}
      defaultTriggerName={searchParams.get('triggerName') ?? undefined}
    />
  )
}
