import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

const COLLAPSE_THRESHOLD = 40

export interface JsonViewerProps {
  value: unknown
  className?: string
  maxHeightClass?: string
  label?: string
}

function formatValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined'
  }
  if (typeof value === 'string') {
    return value
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value)
  } catch {
    return String(value)
  }
}

function lineCount(text: string): number {
  return text.split('\n').length
}

export function JsonViewer({ value, className, maxHeightClass, label }: JsonViewerProps) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const text = formatValue(value)
  const isPrimitive = typeof value !== 'object' || value === null || value === undefined
  const collapsible = !isPrimitive && lineCount(text) > COLLAPSE_THRESHOLD
  const showCollapse = collapsible && !expanded

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label ?? 'JSON'}
        </span>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => void copy()}
          className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
          aria-label="Copy JSON"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </Button>
      </div>
      <div className="relative">
        <pre
          className={cn(
            'overflow-auto rounded-md border border-border bg-muted/50 p-3 font-mono text-[11px] leading-relaxed',
            showCollapse ? 'max-h-48 overflow-hidden [mask-image:linear-gradient(to_bottom,black_60%,transparent)]' : maxHeightClass,
            className
          )}
        >
          {text}
        </pre>
        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="mt-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <>
                <ChevronRight className="h-3 w-3" /> Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" /> Show full output
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
