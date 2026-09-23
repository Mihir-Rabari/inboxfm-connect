import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

const COLUMNS = ['Name', 'Key', 'Created', 'Last used', 'Actions'] as const

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString()
}

function maskedValue({ keyPrefix, truncatedValue }: { keyPrefix: string, truncatedValue: string }): string {
  return `${keyPrefix}${'•'.repeat(8)}${truncatedValue}`
}

export interface ApiKeyRow {
  id: string
  displayName: string
  truncatedValue: string
  created: string
  lastUsedAt: string | null
}

export interface ApiKeysTableProps {
  keys: ApiKeyRow[]
  keyPrefix: string
  onRevoke: (key: ApiKeyRow) => void
}

export function ApiKeysTable({ keys, keyPrefix, onRevoke }: ApiKeysTableProps) {
  return (
    <Card className="overflow-hidden rounded-xl shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              {COLUMNS.map((column) => (
                <th key={column} scope="col" className="px-4 py-3 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {keys.map((key) => (
              <tr key={key.id} className="transition-colors hover:bg-muted/30">
                <td className="max-w-[220px] px-4 py-3">
                  <span className="block truncate font-medium text-foreground">{key.displayName}</span>
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                  {maskedValue({ keyPrefix, truncatedValue: key.truncatedValue })}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(key.created)}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never used'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRevoke(key)}
                      aria-label={`Revoke ${key.displayName}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
