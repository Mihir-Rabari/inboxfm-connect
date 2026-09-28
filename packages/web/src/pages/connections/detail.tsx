import { Activity, AlertCircle, ArrowLeft, CheckCircle2, KeyRound, Loader2, PencilLine, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ConnectionStatusBadge } from '@/components/connections/connection-status-badge'
import { DeleteConnectionDialog } from '@/components/connections/delete-connection-dialog'
import { PieceLogo } from '@/components/connections/piece-logo'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiClientError } from '@/lib/api/client'
import { ConnectionHealthStatus, TestConnectionResponse } from '@/lib/api/types'
import { useConnection, useDeleteConnection, useIntegration, useTestConnection } from '@/lib/query/hooks'
import { connectionLinks } from '@/lib/utils/connection-links'
import { connectionFormat } from '@/lib/utils/connection-format'

function formatDate(value?: string): string {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

interface DetailRowProps {
  label: string
  children: React.ReactNode
}

function DetailRow({ label, children }: DetailRowProps) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between gap-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xs font-medium text-foreground sm:text-right">{children}</dd>
    </div>
  )
}

export default function ConnectionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: connection, isLoading, isError, error, refetch } = useConnection(id)
  const { data: piece } = useIntegration(connection?.pieceName)
  const deleteConnection = useDeleteConnection()
  const testConnection = useTestConnection()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [lastTestResult, setLastTestResult] = useState<TestConnectionResponse | null>(null)

  const handleTestConnection = () => {
    if (!connection || testConnection.isPending) return

    testConnection.mutate(
      { id: connection.id },
      {
        onSuccess: (result) => {
          setLastTestResult(result)
          if (result.success) {
            toast.success('Connection is healthy', {
              description: `${result.message} (${result.responseTimeMs}ms)`,
            })
          } else {
            toast.error('Connection test failed', {
              description: result.message,
            })
          }
        },
        onError: (testError) => {
          const fallbackResult: TestConnectionResponse = {
            success: false,
            status: 'NETWORK_ERROR',
            message:
              testError instanceof Error
                ? testError.message
                : 'Unable to reach the server to test this connection. Check your network and try again.',
            testedAt: new Date().toISOString(),
            responseTimeMs: 0,
          }
          setLastTestResult(fallbackResult)
          toast.error('Connection test failed', {
            description: fallbackResult.message,
          })
        },
      }
    )
  }

  if (!id || isLoading) {
    return (
      <div className="space-y-6" aria-hidden="true" data-testid="connection-detail-skeleton">
        <Skeleton className="h-3 w-40" />
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-full max-w-md" />
          </div>
        </div>
        <Card className="rounded-xl p-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="mb-3 h-4 w-full max-w-sm" />
          ))}
        </Card>
      </div>
    )
  }

  if (isError || !connection) {
    const notFound = error instanceof ApiClientError && error.statusCode === 404
    return (
      <div className="space-y-4">
        <ErrorState
          title={notFound ? 'Connection not found' : 'Unable to load connection.'}
          description={
            notFound
              ? 'This connection may have been deleted or belongs to another project.'
              : 'The connection details could not be loaded. Check your connection and try again.'
          }
          onRetry={() => void refetch()}
        />
        <div className="flex justify-center">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link to="/connections">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Connections</span>
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const pieceDisplayName = piece?.displayName ?? connection.pieceName
  const isTesting = testConnection.isPending
  const isAuthExpired =
    lastTestResult &&
    !lastTestResult.success &&
    (lastTestResult.status === 'AUTH_EXPIRED' ||
      lastTestResult.status === 'AUTH_INVALID' ||
      lastTestResult.status === 'INSUFFICIENT_PERMISSION' ||
      lastTestResult.message.toLowerCase().includes('expired') ||
      lastTestResult.message.toLowerCase().includes('reconnect') ||
      lastTestResult.message.toLowerCase().includes('revoked') ||
      lastTestResult.message.toLowerCase().includes('token') ||
      lastTestResult.message.toLowerCase().includes('invalid'))

  const getStatusTitle = (status: ConnectionHealthStatus, success: boolean): string => {
    if (success) return 'Connection is healthy'
    switch (status) {
      case 'AUTH_EXPIRED':
        return 'Authentication expired'
      case 'AUTH_INVALID':
        return 'Invalid or revoked credentials'
      case 'INSUFFICIENT_PERMISSION':
        return 'Insufficient permissions or missing scopes'
      case 'RATE_LIMITED':
        return 'Provider rate limit exceeded'
      case 'NETWORK_ERROR':
        return 'Network connection failed'
      case 'PROVIDER_ERROR':
        return 'Third-party provider error'
      default:
        return 'Connection test failed'
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={connection.displayName}
        description={`Connected account for ${pieceDisplayName}.`}
        breadcrumbs={[
          { label: 'Connections', href: '/connections' },
          { label: connection.displayName },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleTestConnection}
              disabled={isTesting}
              aria-label="Test connection health"
            >
              {isTesting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Testing connection...</span>
                </>
              ) : (
                <>
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  <span>Test Connection</span>
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link
                to={connectionLinks.reconnect({
                  pieceName: connection.pieceName,
                  externalId: connection.externalId,
                  displayName: connection.displayName,
                })}
              >
                <PencilLine className="h-3.5 w-3.5" />
                <span>Reconnect</span>
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </Button>
          </div>
        }
      />

      {/* Health Check Status Banner */}
      {lastTestResult && (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border p-4 transition-all duration-200 ${
            lastTestResult.success
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100'
              : lastTestResult.status === 'RATE_LIMITED' || lastTestResult.status === 'INSUFFICIENT_PERMISSION'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          <div className="flex items-start gap-3">
            {lastTestResult.success ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  lastTestResult.status === 'RATE_LIMITED' || lastTestResult.status === 'INSUFFICIENT_PERMISSION'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-destructive'
                }`}
              />
            )}
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold leading-tight">
                  {getStatusTitle(lastTestResult.status, lastTestResult.success)}
                </h3>
                <span className="text-[11px] opacity-80">
                  {lastTestResult.responseTimeMs > 0 && `${lastTestResult.responseTimeMs}ms • `}
                  {formatDate(lastTestResult.testedAt)}
                </span>
              </div>
              <p className="text-xs leading-relaxed opacity-90">{lastTestResult.message}</p>
              {isAuthExpired && (
                <div className="mt-2.5 pt-1">
                  <Button size="sm" variant="default" asChild className="gap-1.5 h-7 text-xs">
                    <Link
                      to={connectionLinks.reconnect({
                        pieceName: connection.pieceName,
                        externalId: connection.externalId,
                        displayName: connection.displayName,
                      })}
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Reconnect this account</span>
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Card className="rounded-xl shadow-xs">
        <CardContent className="p-5">
          <div className="mb-5 flex items-center gap-3 border-b border-border pb-4">
            <PieceLogo
              logoUrl={piece?.logoUrl}
              pieceDisplayName={pieceDisplayName}
              className="h-11 w-11"
            />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-foreground">{connection.displayName}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <KeyRound className="h-3 w-3 text-primary" aria-hidden="true" />
                <span>{pieceDisplayName}</span>
              </p>
            </div>
          </div>

          <dl className="space-y-3.5">
            <DetailRow label="Connection">{connection.displayName}</DetailRow>
            <DetailRow label="Integration">{pieceDisplayName}</DetailRow>
            <DetailRow label="Authentication">
              {connectionFormat.connectionTypeLabel(connection.type)}
            </DetailRow>
            <DetailRow label="Status">
              <ConnectionStatusBadge status={connection.status} />
            </DetailRow>
            <DetailRow label="Created">{formatDate(connection.created)}</DetailRow>
            <DetailRow label="Updated">{formatDate(connection.updated)}</DetailRow>
            {connection.externalId && (
              <DetailRow label="External ID">
                <span className="font-mono text-[11px] break-all">{connection.externalId}</span>
              </DetailRow>
            )}
          </dl>

          <p className="mt-5 rounded-md border border-dashed border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
            Credential values are stored encrypted and are never displayed after creation.
          </p>
        </CardContent>
      </Card>

      <DeleteConnectionDialog
        open={deleteOpen}
        connectionName={connection.displayName}
        deleting={deleteConnection.isPending}
        onClose={() => setDeleteOpen(false)}
        onDelete={() => {
          if (!connection) return
          deleteConnection.mutate(
            { id: connection.id },
            {
              onSuccess: () => {
                setDeleteOpen(false)
                navigate('/connections')
              },
              onError: (deleteError) => {
                setDeleteOpen(false)
                toast.error('Failed to delete connection', {
                  description:
                    deleteError instanceof Error
                      ? deleteError.message
                      : 'The connection could not be deleted. Try again.',
                })
              },
            }
          )
        }}
      />
    </div>
  )
}
