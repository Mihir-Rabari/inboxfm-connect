import { Badge } from '@/components/ui/badge'
import { AppConnectionStatus } from '@/lib/api/types'

const STATUS_LABELS: Record<AppConnectionStatus, string> = {
  ACTIVE: 'Connected',
  ERROR: 'Error',
}

const STATUS_VARIANTS: Record<AppConnectionStatus, 'success' | 'destructive'> = {
  ACTIVE: 'success',
  ERROR: 'destructive',
}

interface ConnectionStatusBadgeProps {
  status: AppConnectionStatus
  className?: string
}

export function ConnectionStatusBadge({ status, className }: ConnectionStatusBadgeProps) {
  return (
    <Badge
      variant={STATUS_VARIANTS[status] ?? 'outline'}
      className={`text-[10px] ${className ?? ''}`}
      dot
    >
      {STATUS_LABELS[status] ?? status}
    </Badge>
  )
}
