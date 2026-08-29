import { AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Button } from './button'

export interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
  className?: string
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'An error occurred while loading this data. Please try again.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[240px] flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 p-8 text-center',
        className
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-3">
        <AlertTriangle className="h-5 w-5 stroke-[1.5]" />
      </div>
      <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-sm mb-4 leading-relaxed">{description}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5 border-destructive/30 hover:bg-destructive/10 text-destructive">
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Try again</span>
        </Button>
      )}
    </div>
  )
}
