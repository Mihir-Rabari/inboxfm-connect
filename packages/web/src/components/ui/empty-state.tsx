import { LucideIcon } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { Button } from './button'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  actionIcon?: LucideIcon
  className?: string
  children?: React.ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon: ActionIcon,
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 p-8 text-center',
        className
      )}
    >
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/80 text-muted-foreground mb-4">
          <Icon className="h-6 w-6 stroke-[1.5]" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      {description && <p className="text-xs text-muted-foreground max-w-sm mb-4 leading-relaxed">{description}</p>}
      {actionLabel && onAction && (
        <Button size="sm" onClick={onAction} className="gap-1.5">
          {ActionIcon && <ActionIcon className="h-3.5 w-3.5" />}
          <span>{actionLabel}</span>
        </Button>
      )}
      {children}
    </div>
  )
}
