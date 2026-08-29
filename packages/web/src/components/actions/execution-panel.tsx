import { AlertCircle, Check, Clock, Loader2 } from 'lucide-react'
import { JsonViewer } from '@/components/actions/json-viewer'
import { Badge } from '@/components/ui/badge'

function ProgressSteps({ step }: { step: number }) {
  const steps = [
    { label: 'Connection selected', done: true },
    { label: 'Input validated', done: true },
    { label: 'Executing tool...', done: false },
  ]
  return (
    <ul className="space-y-1.5 text-xs" aria-label="Execution progress">
      {steps.map((entry, index) => (
        <li key={entry.label} className="flex items-center gap-2">
          {index < step ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden="true" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" aria-hidden="true" />
          )}
          <span className={index < step ? 'text-muted-foreground' : 'text-foreground'}>
            {entry.label}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Renders the outcome of a single `POST /v1/execute` call.
 *
 * The backend contract has no result envelope — the response body IS the raw piece
 * action output and the HTTP status is the only success signal. So "Success" here
 * means "the execution layer accepted and ran the tool", and a returned payload that
 * itself contains `success: false` is still rendered as output, not as a framework
 * failure. Only transport/HTTP failures render as a failed request.
 */
export function ExecutionPanel({ record }: { record: LocalExecutionRecord | null }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Execution result"
      data-testid="execution-panel"
      className="space-y-4"
    >
      {!record && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          Configure the input and press <span className="font-medium text-foreground">Execute Tool</span>{' '}
          to run this action against the live API.
        </div>
      )}

      {record?.status === 'pending' && (
        <div className="rounded-lg border border-border bg-card p-4" data-testid="execution-pending">
          <p className="mb-3 text-xs font-semibold text-foreground">Executing</p>
          <ProgressSteps step={record.request.connectionId ? 2 : 0} />
        </div>
      )}

      {record && (record.status === 'success' || record.status === 'failed') && (
        <div className="space-y-3" data-testid={`execution-${record.status}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge
              variant={record.status === 'success' ? 'success' : 'destructive'}
              className="text-xs"
              dot
            >
              {record.status === 'success' ? 'Success' : 'Execution Failed'}
            </Badge>
            {record.durationMs !== null && (
              <span
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                title="Measured in the browser — the backend does not report execution duration for direct tool runs."
              >
                <Clock className="h-3 w-3" />
                Duration: {record.durationMs} ms
              </span>
            )}
          </div>

          {record.transportError && (
            <div
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs leading-relaxed text-destructive"
              data-testid="execution-transport-error"
            >
              <span className="mb-1 flex items-center gap-1.5 font-semibold">
                <AlertCircle className="h-3.5 w-3.5" />
                Request failed
              </span>
              {record.transportError}
            </div>
          )}

          {record.status === 'success' && record.hasOutput && record.output !== undefined && (
            <JsonViewer value={record.output} label="Output" maxHeightClass="max-h-72" />
          )}
          {record.status === 'success' && (!record.hasOutput || record.output === undefined) && (
            <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              The tool completed without returning output.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export type ExecutionPanelStatus = 'idle' | 'pending' | 'success' | 'failed'

export interface LocalExecutionRecord {
  status: ExecutionPanelStatus
  request: {
    projectId?: string
    integration: string
    tool: string
    connectionId: string
    input: Record<string, unknown>
  }
  /** The raw action output. Meaningful only when `hasOutput` is true. */
  output?: unknown
  /**
   * Distinguishes "the action returned nothing" from "there is no response yet".
   * `output` alone cannot express that, because `undefined` is a legal action result.
   */
  hasOutput?: boolean
  durationMs: number | null
  transportError?: string
}
