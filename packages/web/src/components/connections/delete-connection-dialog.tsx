import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface DeleteConnectionDialogProps {
  connectionName?: string
  open: boolean
  deleting?: boolean
  onClose: () => void
  onDelete: () => void
}

export function DeleteConnectionDialog({
  connectionName,
  open,
  deleting = false,
  onClose,
  onDelete,
}: DeleteConnectionDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title="Delete connection?"
      description={
        connectionName
          ? `This removes "${connectionName}" from InboxFM Connect. Existing tools using it will no longer authenticate.`
          : 'This removes the connection from InboxFM Connect. Existing tools using it will no longer authenticate.'
      }
      confirmLabel="Delete"
      cancelLabel="Cancel"
      variant="destructive"
      loading={deleting}
      onConfirm={onDelete}
    />
  )
}
