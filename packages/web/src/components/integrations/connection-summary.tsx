import { KeyRound, PencilLine, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ConnectionStatusBadge } from '@/components/connections/connection-status-badge'
import { PieceLogo } from '@/components/connections/piece-logo'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useConnectionsQuery } from '@/lib/query/hooks'
import { connectionLinks } from '@/lib/utils/connection-links'

interface ConnectionSummaryProps {
  pieceName: string
  displayName: string
  logoUrl?: string
}

function ConnectionRowSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-8 w-8 rounded-md" />
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-2.5 w-24" />
      </div>
    </div>
  )
}

export function ConnectionSummary({ pieceName, displayName, logoUrl }: ConnectionSummaryProps) {
  const connectHref = `/connections/new?pieceName=${encodeURIComponent(pieceName)}`
  const { data, isLoading, isError, refetch } = useConnectionsQuery({ pieceName })
  const connections = data?.data ?? []

  if (isLoading) {
    return (
      <div className="space-y-2" aria-hidden="true">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-card p-4">
            <ConnectionRowSkeleton />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <ErrorState
        title="Unable to load connections."
        description={`Could not check existing ${displayName} connections. Verify you are signed in and try again.`}
        onRetry={() => void refetch()}
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" asChild className="gap-1.5">
          <Link to={connectHref}>
            <Plus className="h-3.5 w-3.5" />
            <span>Connect {displayName}</span>
          </Link>
        </Button>
      </div>

      {connections.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title={`No ${displayName} connections yet.`}
          description="Connect an account to execute authenticated tools."
          className="min-h-[220px]"
        >
          <Button size="sm" variant="outline" asChild className="gap-1.5">
            <Link to={connectHref}>
              <Plus className="h-3.5 w-3.5" />
              <span>Connect {displayName}</span>
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <ul className="divide-y divide-border">
            {connections.map((connection) => (
              <li
                key={connection.id}
                className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40"
              >
                <Link
                  to={`/connections/${connection.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                  aria-label={`View ${connection.displayName}`}
                >
                  <PieceLogo logoUrl={logoUrl} pieceDisplayName={displayName} className="h-8 w-8" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-foreground">
                      {connection.displayName}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      Created {new Date(connection.created).toLocaleDateString()}
                    </span>
                  </span>
                </Link>
                <ConnectionStatusBadge status={connection.status} className="shrink-0" />
                <Button
                  variant="ghost"
                  size="xs"
                  asChild
                  className="shrink-0 gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Link
                    to={connectionLinks.reconnect({
                      pieceName,
                      externalId: connection.externalId,
                      displayName: connection.displayName,
                    })}
                    aria-label={`Reconnect ${connection.displayName}`}
                  >
                    <PencilLine className="h-3 w-3" />
                    <span>Reconnect</span>
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
