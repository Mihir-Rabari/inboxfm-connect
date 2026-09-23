import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export interface RevokeApiKeyDialogProps {
  keyName?: string
  open: boolean
  revoking?: boolean
  onClose: () => void
  onRevoke: () => void
}

export function RevokeApiKeyDialog({ keyName, open, revoking = false, onClose, onRevoke }: RevokeApiKeyDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title="Revoke API key"
      description={
        keyName
          ? `Any service using "${keyName}" will immediately lose access. This cannot be undone.`
          : 'Any service using this key will immediately lose access. This cannot be undone.'
      }
      confirmLabel="Revoke"
      cancelLabel="Cancel"
      variant="destructive"
      loading={revoking}
      onConfirm={onRevoke}
    />
  )
}
