import { cn } from '@/lib/utils/cn'
import { Skeleton } from './skeleton'

export interface LoadingStateProps {
  rows?: number
  className?: string
}

export function LoadingState({ rows = 4, className }: LoadingStateProps) {
  return (
    <div className={cn('w-full space-y-3 p-4', className)}>
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-32 ml-auto" />
      </div>
      <div className="space-y-2 pt-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}
