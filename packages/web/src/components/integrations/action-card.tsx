import { memo } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AuthBadge, requiresConnection } from '@/components/integrations/auth-badge'
import { PieceAction } from '@/lib/api/types'

interface ActionCardProps {
  pieceName: string
  action: PieceAction
  pieceAuthType?: string
}

function inputCount(action: PieceAction): number {
  return Object.keys(action.props ?? {}).length
}

export const ActionCard = memo(({ pieceName, action, pieceAuthType }: ActionCardProps) => {
  const requiresAuth = action.requireAuth ?? requiresConnection(pieceAuthType)
  const propCount = inputCount(action)

  return (
    <Link
      to={`/actions/${encodeURIComponent(pieceName)}/${encodeURIComponent(action.name)}`}
      className="group block rounded-xl border border-border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-foreground">{action.displayName}</h4>
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{action.name}</p>
        </div>
        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {action.description || 'No description provided.'}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {requiresAuth ? (
          <AuthBadge compact authType={pieceAuthType} />
        ) : (
          <span className="text-[10px] text-muted-foreground">No auth</span>
        )}
        {propCount > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {propCount} input{propCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </Link>
  )
})

ActionCard.displayName = 'ActionCard'
