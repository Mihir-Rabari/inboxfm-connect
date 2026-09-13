import { KeyRound, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AuthBadge } from '@/components/integrations/auth-badge'
import { ActionList } from '@/components/integrations/action-list'
import { ConnectionSummary } from '@/components/integrations/connection-summary'
import {
  IntegrationTabValue,
  IntegrationTabs,
  isIntegrationTabValue,
} from '@/components/integrations/integration-tabs'
import { IntegrationHeader } from '@/components/integrations/integration-header'
import { TriggerList } from '@/components/integrations/trigger-list'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiClientError } from '@/lib/api/client'
import { PieceMetadata } from '@/lib/api/types'
import { useIntegration } from '@/lib/query/hooks'

const DEFAULT_TAB: IntegrationTabValue = 'overview'

function normalizeTab(raw: string | null): IntegrationTabValue {
  return raw && isIntegrationTabValue(raw) ? raw : DEFAULT_TAB
}

function matchesSearch(fields: Array<string | undefined>, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return fields.some((field) => field?.toLowerCase().includes(normalized))
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-4">
        <Skeleton className="h-3 w-40" />
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-full max-w-md" />
            <div className="flex gap-1.5 pt-1">
              <Skeleton className="h-4 w-14 rounded-full" />
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-4 border-b border-border pb-2">
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-5 w-20" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}

interface ActionsTabProps {
  piece: PieceMetadata
}

function ActionsTab({ piece }: ActionsTabProps) {
  const [query, setQuery] = useState('')
  const actions = useMemo(() => Object.values(piece.actions ?? {}), [piece])
  const filteredActions = useMemo(
    () =>
      actions.filter((action) =>
        matchesSearch([action.name, action.displayName, action.description], query)
      ),
    [actions, query]
  )

  if (actions.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="No actions available."
        description={`This integration does not expose any actions yet.`}
        className="min-h-[200px]"
      />
    )
  }

  return (
    <div className="space-y-3">
      <Input
        type="search"
        thin
        placeholder="Search actions..."
        aria-label="Search actions"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="max-w-sm"
      />
      {filteredActions.length === 0 ? (
        <EmptyState
          title="No actions match your search."
          description={`Nothing in ${piece.displayName}'s actions matches "${query.trim()}".`}
          actionLabel="Clear Search"
          onAction={() => setQuery('')}
          className="min-h-[160px]"
        />
      ) : (
        <ActionList
          pieceName={piece.name}
          actions={filteredActions}
          pieceAuthType={piece.auth?.type}
        />
      )}
    </div>
  )
}

interface TriggersTabProps {
  piece: PieceMetadata
}

function TriggersTab({ piece }: TriggersTabProps) {
  const triggers = useMemo(() => Object.values(piece.triggers ?? {}), [piece])

  if (triggers.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="No triggers available."
        description={`This integration does not expose any triggers yet.`}
        className="min-h-[200px]"
      />
    )
  }

  return <TriggerList triggers={triggers} pieceAuthType={piece.auth?.type} />
}

interface OverviewTabProps {
  piece: PieceMetadata
  actionCount: number
  triggerCount: number
}

function OverviewTab({ piece, actionCount, triggerCount }: OverviewTabProps) {
  const connectHref = `/connections/new?pieceName=${encodeURIComponent(piece.name)}`
  const requiresAuth = !!piece.auth && piece.auth.type !== 'NO_AUTH'
  const categories = piece.categories ?? []

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card className="rounded-xl p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Summary
        </h3>
        <dl className="mt-3 space-y-2.5 text-xs">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono font-medium text-foreground">{piece.version}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Actions</dt>
            <dd className="font-medium text-foreground">{actionCount}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">Triggers</dt>
            <dd className="font-medium text-foreground">{triggerCount}</dd>
          </div>
          {categories.length > 0 && (
            <div className="flex items-start justify-between gap-4 pt-1">
              <dt className="shrink-0 text-muted-foreground">Categories</dt>
              <dd className="flex flex-wrap justify-end gap-1">
                {categories.map((category) => (
                  <span
                    key={category}
                    className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                  >
                    {category}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </Card>

      <Card className="flex flex-col rounded-xl p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Authentication
        </h3>
        <div className="mt-3 flex flex-1 flex-col items-start gap-3">
          <AuthBadge authType={piece.auth?.type} />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {piece.auth?.description ||
              (requiresAuth
                ? `Connect a ${piece.displayName} account so authenticated tools can execute on your behalf.`
                : `${piece.displayName} tools execute without requiring a connected account.`)}
          </p>
          {requiresAuth && (
            <Button size="sm" asChild className="mt-auto gap-1.5 shadow-xs">
              <Link to={connectHref}>
                <KeyRound className="h-3.5 w-3.5" />
                <span>Connect {piece.displayName}</span>
              </Link>
            </Button>
          )}
        </div>
      </Card>
    </div>
  )
}

export default function IntegrationDetailPage() {
  const { name } = useParams<{ name: string }>()
  const pieceName = name ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = normalizeTab(searchParams.get('tab'))

  const { data: piece, isLoading, isError, error, refetch } = useIntegration(pieceName || undefined)

  if (!pieceName || isLoading) {
    return <DetailSkeleton />
  }

  if (isError || !piece) {
    const notFound = error instanceof ApiClientError && error.statusCode === 404
    return (
      <div className="space-y-4">
        <ErrorState
          title={notFound ? 'Integration not found' : 'Unable to load integration.'}
          description={
            notFound
              ? `No integration named "${pieceName}" exists in the catalog.`
              : 'The integration metadata could not be loaded. Check your connection and try again.'
          }
          onRetry={() => void refetch()}
        />
        <div className="flex justify-center">
          <Button variant="outline" size="sm" asChild>
            <Link to="/integrations">Back to Integrations</Link>
          </Button>
        </div>
      </div>
    )
  }

  const actionCount = Object.keys(piece.actions ?? {}).length
  const triggerCount = Object.keys(piece.triggers ?? {}).length

  const handleTabChange = (tab: IntegrationTabValue) => {
    setSearchParams(tab === DEFAULT_TAB ? {} : { tab })
  }

  return (
    <div className="space-y-6">
      <IntegrationHeader piece={piece} />

      <IntegrationTabs
        value={activeTab}
        onValueChange={handleTabChange}
        counts={{ actions: actionCount, triggers: triggerCount, connections: null }}
        overview={<OverviewTab piece={piece} actionCount={actionCount} triggerCount={triggerCount} />}
        actions={<ActionsTab piece={piece} />}
        triggers={<TriggersTab piece={piece} />}
        connections={
          <ConnectionSummary
            pieceName={piece.name}
            displayName={piece.displayName}
            logoUrl={piece.logoUrl}
          />
        }
      />
    </div>
  )
}
