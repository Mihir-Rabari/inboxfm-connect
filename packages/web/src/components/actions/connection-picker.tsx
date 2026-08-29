import { KeyRound, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { AppConnection } from '@/lib/api/types'
import { connectionLinks } from '@/lib/utils/connection-links'

export interface ConnectionPickerProps {
  pieceName: string
  pieceDisplayName?: string
  connections: AppConnection[]
  isLoading: boolean
  selectedId: string
  onSelect: (connectionId: string) => void
  disabled?: boolean
  error?: string
}

function selectClassName(error?: string): string {
  return [
    'h-9 w-full cursor-pointer rounded-md border bg-card px-3 text-sm shadow-xs transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
    'disabled:cursor-not-allowed disabled:opacity-50',
    error ? 'border-destructive' : 'border-input',
  ].join(' ')
}

export function ConnectionPicker({
  pieceName,
  pieceDisplayName,
  connections,
  isLoading,
  selectedId,
  onSelect,
  disabled = false,
  error,
}: ConnectionPickerProps) {
  if (isLoading) {
    return (
      <div className="space-y-1.5" data-testid="connection-picker-loading">
        <span className="text-xs font-medium text-foreground">Connection</span>
        <div className="h-9 w-full animate-pulse rounded-md border border-border bg-muted/50" />
      </div>
    )
  }

  const activeConnections = connections.filter((connection) => connection.status !== 'ERROR')

  if (connections.length === 0) {
    return (
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-foreground">Connection</span>
        <div
          className="rounded-md border border-dashed border-border bg-muted/40 p-3"
          data-testid="connection-picker-empty"
        >
          <p className="text-xs font-medium text-foreground">
            No {pieceDisplayName ?? pieceName} connections found.
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            Connect an account to use this action.
          </p>
          <Button size="xs" variant="outline" asChild className="mt-2 gap-1">
            <Link to={connectionLinks.newConnection({ pieceName })}>
              <Plus className="h-3 w-3" />
              <span>Connect {pieceDisplayName ?? pieceName}</span>
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="action-connection-select"
        className="flex items-center gap-1.5 text-xs font-medium text-foreground"
      >
        <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
        Connection
      </label>
      <select
        id="action-connection-select"
        aria-describedby={error ? 'action-connection-error' : undefined}
        aria-invalid={!!error || undefined}
        disabled={disabled}
        value={selectedId}
        onChange={(event) => onSelect(event.target.value)}
        className={selectClassName(error)}
      >
        {!selectedId && <option value="">Select a connection...</option>}
        {activeConnections.map((connection) => (
          <option key={connection.id} value={connection.id}>
            {connection.displayName}
          </option>
        ))}
        {connections.length !== activeConnections.length && (
          <optgroup label="Errored — reconnect before use">
            {connections
              .filter((connection) => connection.status === 'ERROR')
              .map((connection) => (
                <option key={connection.id} value={connection.id} disabled>
                  {connection.displayName} (error)
                </option>
              ))}
          </optgroup>
        )}
      </select>
      {error && (
        <p id="action-connection-error" role="alert" className="text-[11px] font-medium text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button size="xs" variant="ghost" asChild className="gap-1 px-0 text-muted-foreground hover:text-primary">
          <Link to={connectionLinks.newConnection({ pieceName })}>
            <Plus className="h-3 w-3" />
            <span>Add Connection</span>
          </Link>
        </Button>
      </div>
    </div>
  )
}
