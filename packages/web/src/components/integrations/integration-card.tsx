import { memo } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PieceSummary } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'
import { formatUtils } from '@/lib/utils/format'
import { AuthBadge, requiresConnection } from './auth-badge'

const MAX_VISIBLE_CATEGORIES = 2

interface IntegrationCardProps {
  piece: PieceSummary
  className?: string
}

export const IntegrationCard = memo(({ piece, className }: IntegrationCardProps) => {
  const visibleCategories = (piece.categories ?? []).slice(0, MAX_VISIBLE_CATEGORIES)
  const hiddenCategoryCount = (piece.categories ?? []).length - visibleCategories.length

  return (
    <Card
      className={cn(
        'group flex flex-col gap-3 rounded-xl p-4 transition-colors hover:border-primary/40',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <img
          src={piece.logoUrl || '/favicon.svg'}
          alt={`${piece.displayName} logo`}
          loading="lazy"
          decoding="async"
          className="h-10 w-10 shrink-0 rounded-md border border-border bg-card object-contain p-1"
        />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground leading-tight">
            {piece.displayName}
          </h3>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">v{piece.version}</span>
            {requiresConnection(piece.auth?.type) && <AuthBadge compact authType={piece.auth?.type} />}
          </div>
        </div>
      </div>

      <p className="line-clamp-2 min-h-[2rem] text-xs leading-relaxed text-muted-foreground">
        {piece.description || 'Callable tools and triggers for automated execution.'}
      </p>

      <div className="mt-auto space-y-3">
        {(visibleCategories.length > 0 || hiddenCategoryCount > 0) && (
          <div className="flex flex-wrap items-center gap-1" aria-label="Categories">
            {visibleCategories.map((category) => (
              <span
                key={category}
                className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {formatUtils.titleFromEnum(category)}
              </span>
            ))}
            {hiddenCategoryCount > 0 && (
              <span className="text-[10px] text-muted-foreground">+{hiddenCategoryCount}</span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <p className="text-[11px] text-muted-foreground">
            <span className="font-semibold text-foreground">{piece.actions || 0}</span> Actions ·{' '}
            <span className="font-semibold text-foreground">{piece.triggers || 0}</span> Triggers
          </p>
          <Button variant="outline" size="xs" asChild>
            <Link to={`/integrations/${encodeURIComponent(piece.name)}`}>View Integration</Link>
          </Button>
        </div>
      </div>
    </Card>
  )
})

IntegrationCard.displayName = 'IntegrationCard'

export function IntegrationCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 rounded-xl p-4" aria-hidden="true">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="flex-1 space-y-1.5 pt-0.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-2.5 w-14" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
      <div className="flex items-center justify-between border-t border-border/60 pt-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-24 rounded-md" />
      </div>
    </Card>
  )
}
