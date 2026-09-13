import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { JsonViewer } from '@/components/actions/json-viewer'

export interface RequestPreviewProps {
  request: {
    integration: string
    tool: string
    connectionId: string
    input: Record<string, unknown>
  }
}

export function RequestPreview({ request }: RequestPreviewProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border border-border bg-card" data-testid="request-preview">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold text-foreground"
      >
        <span>Request</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4">
          <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
            Secret values and credentials are replaced with placeholders.
          </p>
          <JsonViewer value={request} label="POST /v1/execute" maxHeightClass="max-h-60" />
        </div>
      )}
    </div>
  )
}
