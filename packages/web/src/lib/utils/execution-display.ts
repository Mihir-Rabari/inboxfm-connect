import { ExecutionStatus, ExecutionToolCallStatus } from '@/lib/api/types'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline'

/**
 * `CREATED` is shown as "Recorded" on purpose. No backend path calls
 * `executionService.updateStatus`, so every execution stays CREATED — rendering it
 * as "Running" or "Pending" would imply progress the runtime never reports. The
 * remaining labels are ready for the day the lifecycle is wired.
 */
const STATUS_LABELS: Record<ExecutionStatus, string> = {
  CREATED: 'Recorded',
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}

const STATUS_BADGE_VARIANTS: Record<ExecutionStatus, BadgeVariant> = {
  CREATED: 'secondary',
  RUNNING: 'warning',
  COMPLETED: 'success',
  FAILED: 'destructive',
  CANCELLED: 'outline',
}

const TOOL_CALL_STATUS_LABELS: Record<ExecutionToolCallStatus, string> = {
  PENDING: 'Pending',
  RUNNING: 'Running',
  SUCCEEDED: 'Succeeded',
  FAILED: 'Failed',
}

const TOOL_CALL_BADGE_VARIANTS: Record<ExecutionToolCallStatus, BadgeVariant> = {
  PENDING: 'secondary',
  RUNNING: 'warning',
  SUCCEEDED: 'success',
  FAILED: 'destructive',
}

const PROVENANCE_LABELS: Record<ProvenanceKind, string> = {
  trigger: 'Trigger',
  scheduled: 'Scheduled',
  manual: 'Manual/API',
}

function statusLabel(status: ExecutionStatus): string {
  return STATUS_LABELS[status] ?? status
}

function statusVariant(status: ExecutionStatus): BadgeVariant {
  return STATUS_BADGE_VARIANTS[status] ?? 'outline'
}

function toolCallStatusLabel(status: ExecutionToolCallStatus): string {
  return TOOL_CALL_STATUS_LABELS[status] ?? status
}

function toolCallStatusVariant(status: ExecutionToolCallStatus): BadgeVariant {
  return TOOL_CALL_BADGE_VARIANTS[status] ?? 'outline'
}

/**
 * Provenance is only inferable from the untyped `metadata` record, using the exact
 * keys the backend writers set. MCP is intentionally absent: MCP never creates
 * execution rows, so an MCP badge would be fabricated.
 */
function provenance(metadata: Record<string, unknown> | undefined): ProvenanceKind {
  if (metadata === undefined) {
    return 'manual'
  }
  if (typeof metadata.triggerBindingId === 'string') {
    return 'trigger'
  }
  if (typeof metadata.scheduledTaskId === 'string') {
    return 'scheduled'
  }
  return 'manual'
}

function provenanceLabel(kind: ProvenanceKind): string {
  return PROVENANCE_LABELS[kind]
}

function formatAbsoluteTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTimestamp(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(deltaMs / 60000)
  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }
  const days = Math.floor(hours / 24)
  if (days < 7) {
    return `${days}d ago`
  }
  return formatAbsoluteTimestamp(iso)
}

export const executionDisplay = {
  statusLabel,
  statusVariant,
  toolCallStatusLabel,
  toolCallStatusVariant,
  provenance,
  provenanceLabel,
  formatAbsoluteTimestamp,
  formatRelativeTimestamp,
}

export type ProvenanceKind = 'trigger' | 'scheduled' | 'manual'
