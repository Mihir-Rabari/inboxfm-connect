import { Bot, Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PopulatedMcpServer } from '@/lib/api/types'

export interface McpServerCardProps {
  server: PopulatedMcpServer | undefined
  endpointUrl: string
  enabledToolCount: number
  totalToolCount: number
}

function formatDate(value: string | undefined): string {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString()
}

export function McpServerCard({ server, endpointUrl, enabledToolCount, totalToolCount }: McpServerCardProps) {
  const [copied, setCopied] = useState(false)

  const copyEndpoint = async () => {
    await navigator.clipboard.writeText(endpointUrl)
    setCopied(true)
    toast.success('Copied MCP endpoint URL')
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="border-border shadow-xs">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <Bot className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>MCP Server</span>
        </CardTitle>
        <CardDescription className="text-xs">
          The streamable-HTTP endpoint AI agents connect to for this project.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {server ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5" data-testid="mcp-server-meta">
              <Badge variant="secondary" className="text-[10px]">
                {server.type}
              </Badge>
              <Badge variant="success" dot className="text-[10px]">
                Enabled · {enabledToolCount} of {totalToolCount} tools
              </Badge>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Server URL
              </span>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={endpointUrl}
                  aria-label="MCP server URL"
                  data-testid="mcp-server-url"
                  className="min-w-0 flex-1 rounded-md border border-input bg-muted/40 px-3 py-1.5 font-mono text-xs text-foreground"
                />
                <Button
                  size="icon-sm"
                  variant="outline"
                  onClick={() => void copyEndpoint()}
                  aria-label="Copy MCP server URL"
                  data-testid="mcp-copy-server-url"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]" data-testid="mcp-server-dates">
              <dt className="text-muted-foreground">Created</dt>
              <dd className="text-right font-medium text-foreground">{formatDate(server.created)}</dd>
              <dt className="text-muted-foreground">Last updated</dt>
              <dd className="text-right font-medium text-foreground">{formatDate(server.updated)}</dd>
              <dt className="text-muted-foreground">Server ID</dt>
              <dd className="truncate text-right font-mono text-[10px] text-muted-foreground">{server.id}</dd>
            </dl>
          </>
        ) : (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
