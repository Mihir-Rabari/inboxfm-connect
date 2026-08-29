import { ChevronRight, KeyRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AuthBadge } from '@/components/integrations/auth-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PieceMetadata } from '@/lib/api/types'
import { formatUtils } from '@/lib/utils/format'

interface IntegrationHeaderProps {
  piece: PieceMetadata
}

export function IntegrationHeader({ piece }: IntegrationHeaderProps) {
  const connectHref = `/connections/new?pieceName=${encodeURIComponent(piece.name)}`
  const categories = piece.categories ?? []

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link
          to="/integrations"
          className="font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
        >
          Integrations
        </Link>
        <ChevronRight className="h-3.5 w-3.5 stroke-[1.5] text-muted-foreground/60" />
        <span className="font-semibold text-foreground">{piece.displayName}</span>
      </nav>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <img
            src={piece.logoUrl || '/favicon.svg'}
            alt={`${piece.displayName} logo`}
            loading="lazy"
            decoding="async"
            className="h-12 w-12 shrink-0 rounded-lg border border-border bg-card object-contain p-1.5"
          />
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-xl font-bold tracking-tight text-foreground">
              {piece.displayName}
            </h1>
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              {piece.description}
            </p>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <Badge variant="outline" className="font-mono text-[10px] font-normal">
                v{piece.version}
              </Badge>
              {categories.slice(0, 3).map((category) => (
                <span
                  key={category}
                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {formatUtils.titleFromEnum(category)}
                </span>
              ))}
              <AuthBadge authType={piece.auth?.type} />
            </div>
          </div>
        </div>

        <Button size="sm" asChild className="gap-1.5 shadow-xs">
          <Link to={connectHref}>
            <KeyRound className="h-3.5 w-3.5" />
            <span>Connect</span>
          </Link>
        </Button>
      </div>
    </div>
  )
}
