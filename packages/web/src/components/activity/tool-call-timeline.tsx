import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { JsonViewer } from '@/components/actions/json-viewer'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ToolCall } from '@/lib/api/types'
import { executionDisplay } from '@/lib/utils/execution-display'

/**
 * Timeline of `GET /v1/executions/:id/tool-calls`.
 *
 * Every payload here is untrusted: `input`, `output` and `error` are stored raw and
 * the backend has no field-level sensitivity model, so nothing is redacted (a
 * name-guessing redactor would be security theatre) and nothing is rendered as HTML.
 * Values go through JsonViewer, which stringifies into a `<pre>`.
 */
export function ToolCallTimeline({ toolCalls, isLoading, isError, onRetry }: ToolCallTimelineProps) {
  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="tool-calls-loading">
        <p className="sr-only" role="status">Loading tool calls…</p>
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    )
  }

  if (isError) {
    return (
      <div
        role="alert"
        data-testid="tool-calls-error"
        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive"
      >
        <span>The tool calls for this execution could not be loaded.</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded px-1.5 py-0.5 font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (toolCalls.length === 0) {
    return (
      <div
        data-testid="tool-calls-empty"
        className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground"
      >
        <p className="font-semibold text-foreground">No tool calls recorded.</p>
        <p className="mt-1 leading-relaxed">
          The API returned no tool call records for this execution. Nothing in the runtime writes
          them yet, so this is expected rather than evidence that no tools ran.
        </p>
      </div>
    )
  }

  return (
    <ol className="space-y-2" data-testid="tool-calls-list">
      {toolCalls.map((toolCall, index) => (
        <ToolCallRow key={toolCall.id} toolCall={toolCall} position={index + 1} />
      ))}
    </ol>
  )
}

function ToolCallRow({ toolCall, position }: { toolCall: ToolCall; position: number }) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = `tool-call-details-${toolCall.id}`

  return (
    <li className="rounded-xl border border-border bg-card shadow-xs" data-testid="tool-call-row">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        aria-controls={detailsId}
        className="flex w-full flex-wrap items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="tool-call-toggle"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <span className="font-mono text-[10px] text-muted-foreground">{position}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-foreground">
            {toolCall.pieceName} / {toolCall.actionName}
          </span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            v{toolCall.pieceVersion}
            {' · '}
            <time dateTime={toolCall.created}>
              {executionDisplay.formatAbsoluteTimestamp(toolCall.created)}
            </time>
          </span>
        </span>
        {toolCall.latencyMs != null && (
          <span className="font-mono text-[10px] text-muted-foreground" data-testid="tool-call-latency">
            {toolCall.latencyMs} ms
          </span>
        )}
        <Badge
          variant={executionDisplay.toolCallStatusVariant(toolCall.status)}
          className="text-[10px]"
          dot
          data-testid="tool-call-status"
        >
          {executionDisplay.toolCallStatusLabel(toolCall.status)}
        </Badge>
      </button>

      {expanded && (
        <div id={detailsId} className="space-y-3 border-t border-border px-4 py-3" data-testid="tool-call-details">
          <dl className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
            <div>
              <dt className="font-semibold uppercase tracking-wider text-muted-foreground">Tool call ID</dt>
              <dd className="mt-0.5 break-all font-mono text-foreground">{toolCall.id}</dd>
            </div>
            {toolCall.connectionId != null && (
              <div>
                <dt className="font-semibold uppercase tracking-wider text-muted-foreground">Connection</dt>
                <dd className="mt-0.5 break-all font-mono text-foreground">{toolCall.connectionId}</dd>
              </div>
            )}
            {toolCall.finished != null && (
              <div>
                <dt className="font-semibold uppercase tracking-wider text-muted-foreground">Finished</dt>
                <dd className="mt-0.5 text-foreground">
                  <time dateTime={toolCall.finished}>
                    {executionDisplay.formatAbsoluteTimestamp(toolCall.finished)}
                  </time>
                </dd>
              </div>
            )}
          </dl>

          <JsonViewer value={toolCall.input} label="Input" maxHeightClass="max-h-60" />

          {toolCall.output !== undefined && toolCall.output !== null && (
            <JsonViewer value={toolCall.output} label="Output" maxHeightClass="max-h-60" />
          )}

          {toolCall.error != null && (
            <div data-testid="tool-call-error">
              <JsonViewer value={toolCall.error} label="Error" maxHeightClass="max-h-60" />
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export interface ToolCallTimelineProps {
  toolCalls: ToolCall[]
  isLoading: boolean
  isError: boolean
  onRetry?: () => void
}
