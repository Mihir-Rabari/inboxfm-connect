import { KeyRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils/cn'

const AUTH_TYPE_LABELS: Record<string, string> = {
  OAUTH2: 'OAuth 2.0',
  SECRET_TEXT: 'Secret / API Key',
  BASIC_AUTH: 'Basic Auth',
  CUSTOM_AUTH: 'Custom Auth',
}

function authLabelFor(authType?: string): string {
  if (!authType || authType === 'NO_AUTH') {
    return 'No authentication'
  }
  return AUTH_TYPE_LABELS[authType] ?? authType.toLowerCase().replace(/_/g, ' ')
}

export function requiresConnection(authType?: string): boolean {
  return !!authType && authType !== 'NO_AUTH'
}

interface AuthBadgeProps {
  authType?: string
  compact?: boolean
  className?: string
}

export function AuthBadge({ authType, compact = false, className }: AuthBadgeProps) {
  const requiresAuth = requiresConnection(authType)

  if (!requiresAuth) {
    return (
      <Badge variant="outline" className={cn('text-[10px] font-medium text-muted-foreground', className)}>
        No auth
      </Badge>
    )
  }

  const label = authLabelFor(authType)

  if (compact) {
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary"
              aria-label={`Requires connection (${label})`}
            >
              <KeyRound className="h-3 w-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Requires connection · {label}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <Badge variant="secondary" className={cn('gap-1 text-[10px]', className)}>
      <KeyRound className="h-3 w-3" />
      <span>{label}</span>
    </Badge>
  )
}
