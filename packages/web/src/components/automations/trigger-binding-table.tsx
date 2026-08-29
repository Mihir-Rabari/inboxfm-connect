import { Link } from 'react-router-dom'
import { Pencil, Power, Trash2 } from 'lucide-react'
import { AutomationStatusBadge } from '@/components/automations/automation-status-badge'
import { PieceLogo } from '@/components/connections/piece-logo'
import { Button } from '@/components/ui/button'
import { AppConnection, AutomationStatus, PieceSummary, TriggerBinding } from '@/lib/api/types'
import { formatUtils } from '@/lib/utils/format'

export interface TriggerBindingTableProps {
  bindings: TriggerBinding[]
  connectionsById: Record<string, AppConnection>
  integrationsByName: Record<string, PieceSummary>
  pendingStatusChangeId: string | null
  onToggleStatus: (binding: TriggerBinding) => void
  onRequestDelete: (binding: TriggerBinding) => void
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function connectionLabel(connection?: AppConnection): string {
  if (!connection) {
    return 'No connection'
  }
  return connection.displayName
}

export function TriggerBindingTable({
  bindings,
  connectionsById,
  integrationsByName,
  pendingStatusChangeId,
  onToggleStatus,
  onRequestDelete,
}: TriggerBindingTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs" data-testid="trigger-binding-table">
      <table className="w-full min-w-[760px] border-collapse text-left text-xs">
        <caption className="sr-only">Trigger bindings</caption>
        <thead>
          <tr className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <th scope="col" className="px-4 py-2.5 font-semibold">Source</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Connection</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Instruction</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Status</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">Created</th>
            <th scope="col" className="px-4 py-2.5 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {bindings.map((binding) => {
            const integration = integrationsByName[binding.pieceName]
            const connection = binding.connectionId ? connectionsById[binding.connectionId] : undefined
            const nextStatus: AutomationStatus = binding.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
            return (
              <tr key={binding.id} className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors" data-testid="trigger-binding-row">
                <td className="px-4 py-3">
                  <Link to={`/automations/triggers/${binding.id}`} className="group flex items-center gap-3">
                    <PieceLogo logoUrl={integration?.logoUrl} pieceDisplayName={integration?.displayName ?? binding.pieceName} />
                    <span className="flex flex-col min-w-0">
                      <span className="font-semibold text-foreground group-hover:text-primary transition-colors truncate max-w-[220px]">
                        {integration?.displayName ?? binding.pieceName}
                      </span>
                      <code className="font-mono text-[10px] text-muted-foreground truncate">{binding.triggerName}</code>
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{connectionLabel(connection)}</td>
                <td className="max-w-[260px] px-4 py-3">
                  <span className="block truncate text-muted-foreground" title={binding.promptTemplate}>
                    {binding.promptTemplate}
                  </span>
                </td>
                <td className="px-4 py-3"><AutomationStatusBadge status={binding.status} /></td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatDate(binding.created)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={pendingStatusChangeId === binding.id}
                      onClick={() => onToggleStatus(binding)}
                      aria-label={
                        binding.status === 'ENABLED'
                          ? `Disable ${binding.triggerName} binding`
                          : `Enable ${binding.triggerName} binding`
                      }
                      title={binding.status === 'ENABLED' ? 'Disable' : 'Enable'}
                      className="gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <Power className="h-3.5 w-3.5" />
                      <span>{formatUtils.titleFromEnum(nextStatus)}</span>
                    </Button>
                    <Button variant="ghost" size="icon-xs" asChild className="text-muted-foreground hover:text-foreground" aria-label={`Edit ${binding.triggerName} binding`}>
                      <Link to={`/automations/triggers/${binding.id}/edit`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRequestDelete(binding)}
                      aria-label={`Delete ${binding.triggerName} binding`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
