import { Check, Copy, Key, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ProjectApiKeyWithValue } from '@/lib/api/types'
import {
  useCreateProjectApiKey,
  useDeleteProjectApiKey,
  useProjectApiKeysQuery,
} from '@/lib/query/hooks'

export function ApiKeysManager() {
  const { data, isLoading } = useProjectApiKeysQuery()
  const createKey = useCreateProjectApiKey()
  const deleteKey = useDeleteProjectApiKey()

  const [createOpen, setCreateOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [revealedKey, setRevealedKey] = useState<ProjectApiKeyWithValue | null>(null)
  const [copied, setCopied] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!displayName.trim()) return
    try {
      const created = await createKey.mutateAsync({ displayName: displayName.trim() })
      setCreateOpen(false)
      setDisplayName('')
      setRevealedKey(created)
    } catch (error) {
      toast.error('Could not create API key', {
        description: error instanceof Error ? error.message : 'Try again.',
      })
    }
  }

  const handleCopy = () => {
    if (!revealedKey) return
    navigator.clipboard.writeText(revealedKey.value)
    setCopied(true)
    toast.success('API key copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = async () => {
    if (!pendingDeleteId) return
    try {
      await deleteKey.mutateAsync({ id: pendingDeleteId })
      toast.success('API key revoked')
    } catch (error) {
      toast.error('Could not revoke API key', {
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setPendingDeleteId(null)
    }
  }

  const keys = data?.data ?? []

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        API keys authenticate external backend services and AI agents against your project.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : keys.length === 0 ? (
        <EmptyState
          icon={Key}
          title="No API keys yet"
          description="Create a key to call the Connect API from your backend."
          className="min-h-0 py-6"
        />
      ) : (
        <ul className="space-y-2">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{key.displayName}</p>
                <p className="font-mono text-[11px] text-muted-foreground">•••• {key.truncatedValue}</p>
              </div>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => setPendingDeleteId(key.id)}
                aria-label={`Revoke ${key.displayName}`}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setCreateOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        <span>Create Project API Key</span>
      </Button>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>
              Name this key so you can recognize it later. The key is scoped to the current project.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            placeholder="e.g. Production backend"
            autoFocus
          />
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)} disabled={createKey.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void handleCreate()} loading={createKey.isPending} disabled={!displayName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!revealedKey} onOpenChange={(open) => !open && setRevealedKey(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>
              Copy this now — it won&apos;t be shown again. Store it somewhere safe.
            </DialogDescription>
          </DialogHeader>
          <div className="relative">
            <pre className="overflow-x-auto rounded-md bg-muted/40 p-3 font-mono text-xs text-foreground">
              {revealedKey?.value}
            </pre>
            <Button size="icon-xs" variant="outline" onClick={handleCopy} className="absolute right-2 top-2">
              {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </Button>
          </div>
          <DialogFooter className="mt-4">
            <Button size="sm" onClick={() => setRevealedKey(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDeleteId}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title="Revoke API key"
        description="Any service using this key will immediately lose access. This cannot be undone."
        confirmLabel="Revoke"
        variant="destructive"
        loading={deleteKey.isPending}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}
