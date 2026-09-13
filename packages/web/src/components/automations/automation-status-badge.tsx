import { Badge } from '@/components/ui/badge'
import { AutomationStatus } from '@/lib/api/types'

interface AutomationStatusBadgeProps {
  status: AutomationStatus
}

export function AutomationStatusBadge({ status }: AutomationStatusBadgeProps) {
  const enabled = status === 'ENABLED'
  return (
    <Badge
      variant={enabled ? 'success' : 'outline'}
      className="text-[10px]"
      dot
      data-testid={`automation-status-${status.toLowerCase()}`}
    >
      {enabled ? 'Enabled' : 'Disabled'}
    </Badge>
  )
}
