import { memo } from 'react'
import { Radio, Webhook } from 'lucide-react'
import { AuthBadge, requiresConnection } from '@/components/integrations/auth-badge'
import { PieceTrigger } from '@/lib/api/types'

interface TriggerCardProps {
  trigger: PieceTrigger
  pieceAuthType?: string
}

const TYPE_META: Record<PieceTrigger['type'], { label: string; icon: typeof Radio }> = {
  POLLING: { label: 'Polling', icon: Radio },
  WEBHOOK: { label: 'Webhook', icon: Webhook },
}

export const TriggerCard = memo(({ trigger, pieceAuthType }: TriggerCardProps) => {
  const typeMeta = TYPE_META[trigger.type] ?? TYPE_META.POLLING
  const TypeIcon = typeMeta.icon
  const requiresAuth = requiresConnection(pieceAuthType)
  const propCount = Object.keys(trigger.props ?? {}).length

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-foreground">{trigger.displayName}</h4>
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{trigger.name}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <TypeIcon className="h-3 w-3" />
          <span>{typeMeta.label}</span>
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {trigger.description || 'No description provided.'}
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
    </div>
  )
})

TriggerCard.displayName = 'TriggerCard'
