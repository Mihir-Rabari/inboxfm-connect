import { PieceAction } from '@/lib/api/types'
import { ActionCard } from './action-card'

interface ActionListProps {
  pieceName: string
  actions: PieceAction[]
  pieceAuthType?: string
}

export function ActionList({ pieceName, actions, pieceAuthType }: ActionListProps) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {actions.map((action) => (
        <ActionCard
          key={action.name}
          pieceName={pieceName}
          action={action}
          pieceAuthType={pieceAuthType}
        />
      ))}
    </div>
  )
}
