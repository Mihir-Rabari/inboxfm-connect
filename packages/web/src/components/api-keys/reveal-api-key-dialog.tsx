import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface RevealedApiKey {
  displayName: string
  value: string
}

export interface RevealApiKeyDialogProps {
  revealedKey: RevealedApiKey | null
  onClose: () => void
}

export function RevealApiKeyDialog({ revealedKey, onClose }: RevealApiKeyDialogProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!revealedKey) return
    navigator.clipboard.writeText(revealedKey.value)
    setCopied(true)
    toast.success('API key copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={!!revealedKey} onOpenChange={(open) => !open && onClose()}>
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
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
