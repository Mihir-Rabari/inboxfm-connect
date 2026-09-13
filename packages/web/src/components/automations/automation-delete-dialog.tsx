import { ConfirmDialog } from '@/components/ui/confirm-dialog'

export interface AutomationDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kind: 'trigger-binding' | 'scheduled-task'
  label: string
  loading?: boolean
  onConfirm: () => void
}

const COPY: Record<AutomationDeleteDialogProps['kind'], { title: string; description: (label: string) => string }> = {
  'trigger-binding': {
    title: 'Delete trigger binding?',
    description: (label) =>
      `"${label}" will stop receiving events. Future event-driven executions will no longer run. This cannot be undone.`,
  },
  'scheduled-task': {
    title: 'Delete scheduled task?',
    description: (label) =>
      `"${label}" will be removed and its recurring runs will stop immediately. This cannot be undone.`,
  },
}

export function AutomationDeleteDialog({
  open,
  onOpenChange,
  kind,
  label,
  loading = false,
  onConfirm,
}: AutomationDeleteDialogProps) {
  const copy = COPY[kind]
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description(label)}
      confirmLabel="Delete"
      variant="destructive"
      loading={loading}
      onConfirm={onConfirm}
    />
  )
}
