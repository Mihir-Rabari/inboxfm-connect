import { ArrowLeft, Pencil, PlayCircle, Power, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AutomationDeleteDialog } from '@/components/automations/automation-delete-dialog'
import { AutomationStatusBadge } from '@/components/automations/automation-status-badge'
import { JsonViewer } from '@/components/actions/json-viewer'
import { PieceLogo } from '@/components/connections/piece-logo'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Execution, TriggerBinding } from '@/lib/api/types'
import { executionErrors } from '@/lib/utils/execution-errors'
import {
  useConnection,
  useDeleteTriggerBinding,
  useDisableTriggerBinding,
  useEnableTriggerBinding,
  useIntegration,
  useRunTriggerBinding,
  useTriggerBindingQuery,
} from '@/lib/query/hooks'

const RESERVED_SETTING_KEYS = new Set(['cronExpression', 'renewCronExpression'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default function TriggerBindingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const bindingQuery = useTriggerBindingQuery(id)
  const binding = bindingQuery.data

  const enableMutation = useEnableTriggerBinding()
  const disableMutation = useDisableTriggerBinding()
  const deleteMutation = useDeleteTriggerBinding()
  const runMutation = useRunTriggerBinding()

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [payloadText, setPayloadText] = useState('')
  const [payloadError, setPayloadError] = useState<string | undefined>(undefined)
  const [testExecutions, setTestExecutions] = useState<Execution[] | null>(null)

  const metadataQuery = useIntegration(binding?.pieceName)
  const connectionQuery = useConnection(binding?.connectionId ?? undefined)

  if (bindingQuery.isLoading) {
    return (
      <div className="max-w-3xl space-y-4" aria-hidden="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  if (bindingQuery.isError || !binding) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Trigger Binding"
          breadcrumbs={[
            { label: 'Automations', href: '/automations/triggers' },
            { label: id ?? '' },
          ]}
        />
        <ErrorState
          title="Trigger binding not found"
          description={executionErrors.describe(
            bindingQuery.error,
            'This binding may have been deleted or belongs to another project.'
          )}
          onRetry={() => void bindingQuery.refetch()}
        />
        <div className="flex justify-center">
          <Button variant="outline" size="sm" asChild className="gap-1.5">
            <Link to="/automations/triggers">
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>All Trigger Bindings</span>
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const piece = metadataQuery.data
  const scheduleCron = typeof binding.settings?.cronExpression === 'string' ? binding.settings.cronExpression : null
  const renewCron =
    typeof binding.settings?.renewCronExpression === 'string' ? binding.settings.renewCronExpression : null
  const configSettings = isRecord(binding.settings)
    ? Object.fromEntries(Object.entries(binding.settings).filter(([key]) => !RESERVED_SETTING_KEYS.has(key)))
    : {}
  const hasConfig = Object.keys(configSettings).length > 0

  async function handleToggleStatus() {
    if (!binding) return
    try {
      if (binding.status === 'ENABLED') {
        await disableMutation.mutateAsync({ id: binding.id })
        toast.success('Trigger binding disabled')
      } else {
        await enableMutation.mutateAsync({ id: binding.id })
        toast.success('Trigger binding enabled')
      }
    } catch (mutationError) {
      toast.error('Could not change the binding status', {
        description: executionErrors.describe(mutationError, 'Try again in a moment.'),
      })
    }
  }

  async function handleDelete() {
    if (!binding) return
    try {
      await deleteMutation.mutateAsync({ id: binding.id })
      toast.success('Trigger binding deleted')
      navigate('/automations/triggers')
    } catch (mutationError) {
      toast.error('Failed to delete trigger binding', {
        description: executionErrors.describe(mutationError, 'The binding could not be deleted.'),
      })
    }
  }

  async function handleTest() {
    if (!binding) return
    let payload: unknown = undefined
    const trimmed = payloadText.trim()
    if (trimmed !== '') {
      try {
        payload = JSON.parse(trimmed)
      } catch {
        setPayloadError('Event payload must be valid JSON.')
        return
      }
    }
    setPayloadError(undefined)
    try {
      const executions = await runMutation.mutateAsync({ id: binding.id, payload })
      setTestExecutions(executions)
      toast.success(
        executions.length === 1
          ? 'Trigger executed — 1 record created'
          : `Trigger executed — ${executions.length} records created`
      )
    } catch (runError) {
      setTestExecutions(null)
      toast.error('Trigger test failed', {
        description: executionErrors.describe(runError, 'The trigger could not be executed.'),
      })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${piece?.displayName ?? binding.pieceName} / ${binding.triggerName}`}
        description={selectedTriggerDescription(piece, binding)}
        breadcrumbs={[
          { label: 'Automations', href: '/automations/triggers' },
          { label: 'Trigger Bindings', href: '/automations/triggers' },
          { label: binding.id.slice(0, 8) },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link to={`/automations/triggers/${binding.id}/edit`}>
                <Pencil className="h-3.5 w-3.5" />
                <span>Edit</span>
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={enableMutation.isPending || disableMutation.isPending}
              onClick={() => void handleToggleStatus()}
            >
              <Power className="h-3.5 w-3.5" />
              <span>{binding.status === 'ENABLED' ? 'Disable' : 'Enable'}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
              data-testid="detail-delete-button"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Delete</span>
            </Button>
          </div>
        }
      />

      <section className="rounded-xl border border-border bg-card p-5 shadow-xs" aria-label="Binding overview">
        <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
          <PieceLogo logoUrl={piece?.logoUrl} pieceDisplayName={piece?.displayName ?? binding.pieceName} />
          <div className="min-w-0 flex-1">
            <code className="font-mono text-[11px] text-muted-foreground">{binding.id}</code>
          </div>
          <AutomationStatusBadge status={binding.status} />
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 pt-4 sm:grid-cols-2" data-testid="binding-overview">
          <Detail label="Source Integration">
            {piece ? (
              <Link to={`/integrations/${encodeURIComponent(piece.name)}?tab=triggers`} className="text-xs font-semibold text-primary hover:underline">
                {piece.displayName}
              </Link>
            ) : (
              <code className="font-mono text-xs text-foreground">{binding.pieceName}</code>
            )}
          </Detail>
          <Detail label="Trigger">
            <code className="font-mono text-xs text-foreground">{binding.triggerName}</code>
          </Detail>
          <Detail label="Connection">
            {binding.connectionId ? (
              <span className="text-xs text-foreground">
                {connectionQuery.data?.displayName ?? `${binding.connectionId.slice(0, 8)}…`}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">No connection</span>
            )}
          </Detail>
          <Detail label="Piece Version">
            <code className="font-mono text-xs text-foreground">{binding.pieceVersion}</code>
          </Detail>
          <Detail label="Created">
            <span className="text-xs text-foreground">{formatDateTime(binding.created)}</span>
          </Detail>
          <Detail label="Updated">
            <span className="text-xs text-foreground">{formatDateTime(binding.updated)}</span>
          </Detail>
        </dl>

        <div className="mt-4 space-y-1.5 border-t border-border pt-4">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Execution Instruction</dt>
          <dd>
            <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3 text-xs leading-relaxed text-foreground" data-testid="detail-prompt">
              {binding.promptTemplate}
            </p>
          </dd>
        </div>

        {(scheduleCron || renewCron) && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            {scheduleCron && (
              <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
                run cron: {scheduleCron}
              </Badge>
            )}
            {renewCron && (
              <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
                renewal cron: {renewCron}
              </Badge>
            )}
          </div>
        )}

        {hasConfig && (
          <div className="mt-4 space-y-1.5 border-t border-border pt-4">
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Trigger Configuration</dt>
            <dd>
              <JsonViewer value={configSettings} label="Trigger configuration" maxHeightClass="max-h-56" />
            </dd>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-xs" aria-label="Test trigger" data-testid="test-trigger-section">
        <div className="flex items-start gap-2.5">
          <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Test Trigger</h2>
            <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-muted-foreground">
              This will execute the configured instruction — HeadlessRuntime may invoke real tools through your
              connected account. Optionally provide a simulated event payload.
            </p>
          </div>
        </div>

        <label htmlFor="test-payload" className="mt-4 block text-xs font-medium text-foreground">
          Event payload <span className="font-normal text-muted-foreground">(optional JSON)</span>
        </label>
        <textarea
          id="test-payload"
          rows={4}
          spellCheck={false}
          value={payloadText}
          onChange={(event) => {
            setPayloadText(event.target.value)
            setPayloadError(undefined)
          }}
          placeholder='{ "action": "opened", "issue": { "number": 42 } }'
          aria-invalid={!!payloadError || undefined}
          aria-describedby={payloadError ? 'test-payload-error' : undefined}
          className={`mt-1.5 w-full rounded-md border border-input bg-muted/20 px-3 py-2 font-mono text-xs shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${payloadError ? 'border-destructive' : ''}`}
        />
        {payloadError && (
          <p id="test-payload-error" role="alert" className="mt-1 text-[11px] font-medium text-destructive">
            {payloadError}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            loading={runMutation.isPending}
            disabled={binding.status !== 'ENABLED' || runMutation.isPending}
            onClick={() => void handleTest()}
            className="gap-1.5 font-semibold"
            data-testid="run-test-button"
          >
            <PlayCircle className="h-3.5 w-3.5" />
            <span>Run Test</span>
          </Button>
          {binding.status !== 'ENABLED' && (
            <span className="text-[11px] text-muted-foreground">Enable this binding to run tests.</span>
          )}
        </div>

        {testExecutions !== null && (
          <div className="mt-4 border-t border-border pt-4" aria-live="polite" data-testid="test-result">
            <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Result ({testExecutions.length} record{testExecutions.length === 1 ? '' : 's'})
            </h3>
            {testExecutions.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                The trigger ran successfully but produced no records for this payload.
              </p>
            ) : (
              <ul className="space-y-2">
                {testExecutions.map((execution) => (
                  <li key={execution.id}>
                    <Link
                      to={`/activity/${execution.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 transition-colors hover:border-primary/40"
                    >
                      <code className="font-mono text-[11px] text-foreground">{execution.id}</code>
                      <span className="flex items-center gap-2">
                        <Badge variant={execution.status === 'FAILED' ? 'destructive' : 'outline'} className="text-[10px]">
                          {execution.status}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{formatDateTime(execution.created)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <AutomationDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        kind="trigger-binding"
        label={`${binding.pieceName} / ${binding.triggerName}`}
        loading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

function selectedTriggerDescription(
  piece: { displayName: string; triggers?: Record<string, { name: string; description: string }> } | undefined,
  binding: TriggerBinding
): string | undefined {
  const description = piece?.triggers?.[binding.triggerName]?.description
  return description || undefined
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
