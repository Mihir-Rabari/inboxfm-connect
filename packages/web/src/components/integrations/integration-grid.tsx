import { PieceSummary } from '@/lib/api/types'
import { IntegrationCard, IntegrationCardSkeleton } from './integration-card'

interface IntegrationGridProps {
  pieces: PieceSummary[]
}

export function IntegrationGrid({ pieces }: IntegrationGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {pieces.map((piece) => (
        <IntegrationCard key={piece.name} piece={piece} />
      ))}
    </div>
  )
}

interface IntegrationGridSkeletonProps {
  count?: number
}

export function IntegrationGridSkeleton({ count = 9 }: IntegrationGridSkeletonProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <IntegrationCardSkeleton key={index} />
      ))}
    </div>
  )
}
