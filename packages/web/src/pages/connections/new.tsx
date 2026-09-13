import { ArrowLeft, CheckCircle2, PlugZap } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { AuthBadge } from '@/components/integrations/auth-badge'
import { BasicAuthConnect } from '@/components/connections/basic-auth-connect'
import { CustomAuthConnect } from '@/components/connections/custom-auth-connect'
import { OAuthConnect } from '@/components/connections/oauth-connect'
import { SecretTextConnect } from '@/components/connections/secret-text-connect'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiClientError } from '@/lib/api/client'
import { useIntegration } from '@/lib/query/hooks'

function NewConnectionSkeleton() {
  return (
    <div className="max-w-xl space-y-4" aria-hidden="true" data-testid="new-connection-skeleton">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-9 w-9 rounded-md" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-full max-w-xs" />
        </div>
      </div>
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
        <Skeleton className="h-8 w-32" />
      </div>
    </div>
  )
}

export default function NewConnectionPage() {
  const [searchParams] = useSearchParams()
  const pieceName = searchParams.get('pieceName') ?? ''
  const externalId = searchParams.get('externalId') ?? undefined
  const displayName = searchParams.get('displayName') ?? undefined
  const isReconnect = !!externalId

  const {
    data: piece,
    isLoading,
    isError,
    error,
    refetch,
  } = useIntegration(pieceName || undefined)

  const backHref = pieceName && piece ? `/integrations/${encodeURIComponent(piece.name)}` : '/integrations'

  if (!pieceName) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="New Connection"
          description="Register a connected account so authenticated tools can execute for this project."
          breadcrumbs={[{ label: 'Connections', href: '/connections' }, { label: 'New Connection' }]}
        />
        <Card className="rounded-xl">
          <CardContent className="p-5 text-center">
            <p className="text-xs font-medium text-foreground">No integration selected</p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Pick an integration from the catalog to start a connection.
            </p>
            <Button size="sm" asChild className="mt-4 gap-1.5">
              <Link to="/integrations">
                <PlugZap className="h-3.5 w-3.5" />
                <span>Browse Integrations</span>
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const breadcrumbs = [
    { label: 'Connections', href: '/connections' },
    ...(piece
      ? [{ label: piece.displayName, href: `/integrations/${encodeURIComponent(piece.name)}` }]
      : []),
    { label: isReconnect ? 'Reconnect' : 'New Connection' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title={isReconnect ? `Reconnect ${displayName ?? pieceName}` : 'New Connection'}
        description={
          isReconnect
            ? 'Repeat the authorization to refresh this account in place.'
            : 'Choose how you want to authenticate and create a connection.'
        }
        breadcrumbs={breadcrumbs}
      />

      {isLoading || !pieceName ? (
        <NewConnectionSkeleton />
      ) : isError || !piece ? (
        <div className="space-y-4">
          <ErrorState
            title={
              error instanceof ApiClientError && error.statusCode === 404
                ? 'Integration not found'
                : 'Unable to load integration.'
            }
            description={
              error instanceof ApiClientError && error.statusCode === 404
                ? `No integration named "${pieceName}" exists in the catalog.`
                : 'The integration metadata could not be loaded. Check your connection and try again.'
            }
            onRetry={() => void refetch()}
          />
          <div className="flex justify-center">
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link to={backHref}>
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </Link>
            </Button>
          </div>
        </div>
      ) : !piece.auth || piece.auth.type === 'NO_AUTH' ? (
        <Card className="rounded-xl">
          <CardContent className="p-5 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" aria-hidden="true" />
            <p className="mt-2 text-xs font-semibold text-foreground">
              {piece.displayName} does not require a connection
            </p>
            <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
              This integration's tools execute without credentials, so there is nothing to connect here.
            </p>
            <Button variant="outline" size="sm" asChild className="mt-4 gap-1.5">
              <Link to={`/integrations/${encodeURIComponent(piece.name)}`}>View Integration</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2" data-testid="auth-type-indicator">
            <AuthBadge authType={piece.auth.type} />
            <span className="text-[11px] text-muted-foreground">
              {isReconnect ? 'Reconnecting existing account' : 'Authentication required'}
            </span>
          </div>

          {piece.auth.type === 'OAUTH2' && (
            <OAuthConnect
              key={`oauth-${externalId ?? 'new'}`}
              piece={piece}
              auth={piece.auth}
              externalId={externalId}
              defaultDisplayName={displayName}
              isReconnect={isReconnect}
            />
          )}
          {piece.auth.type === 'SECRET_TEXT' && (
            <SecretTextConnect
              key={`secret-${externalId ?? 'new'}`}
              piece={piece}
              externalId={externalId}
              defaultDisplayName={displayName}
              isReconnect={isReconnect}
            />
          )}
          {piece.auth.type === 'BASIC_AUTH' && (
            <BasicAuthConnect
              key={`basic-${externalId ?? 'new'}`}
              piece={piece}
              externalId={externalId}
              defaultDisplayName={displayName}
              isReconnect={isReconnect}
            />
          )}
          {(piece.auth.type === 'CUSTOM_AUTH') && (
            <CustomAuthConnect
              key={`custom-${externalId ?? 'new'}`}
              piece={piece}
              auth={piece.auth}
              externalId={externalId}
              defaultDisplayName={displayName}
              isReconnect={isReconnect}
            />
          )}
          {!['OAUTH2', 'SECRET_TEXT', 'BASIC_AUTH', 'CUSTOM_AUTH'].includes(piece.auth.type) && (
            <Card className="rounded-xl">
              <CardContent className="p-5 text-center">
                <p className="text-xs font-semibold text-foreground">Unsupported authentication type</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                  This integration uses the "{piece.auth.type}" authentication method, which is not
                  supported by this console yet.
                </p>
                <Button variant="outline" size="sm" asChild className="mt-4 gap-1.5">
                  <Link to={`/integrations/${encodeURIComponent(piece.name)}`}>Back to Integration</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
