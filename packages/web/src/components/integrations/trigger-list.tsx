import { PieceTrigger } from '@/lib/api/types'
import { TriggerCard } from './trigger-card'

interface TriggerListProps {
  triggers: PieceTrigger[]
  pieceAuthType?: string
}

export function TriggerList({ triggers, pieceAuthType }: TriggerListProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {triggers.map((trigger) => (
        <TriggerCard key={trigger.name} trigger={trigger} pieceAuthType={pieceAuthType} />
      ))}
    </div>
  )
}
