import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils/cn'
import { formatUtils } from '@/lib/utils/format'

export const ALL_CATEGORIES = 'ALL'

interface CategoryFilterProps {
  categories: string[]
  value: string
  onChange: (category: string) => void
  isLoading?: boolean
  className?: string
}

export function CategoryFilter({
  categories,
  value,
  onChange,
  isLoading = false,
  className,
}: CategoryFilterProps) {
  if (isLoading) {
    return (
      <div className={cn('flex flex-wrap gap-1.5', className)} aria-hidden="true">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-6 w-24 rounded-full" />
        ))}
      </div>
    )
  }

  const options = [ALL_CATEGORIES, ...categories]

  return (
    <div role="group" aria-label="Filter by category" className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((option) => {
        const isSelected = value === option
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(option)}
            className={cn(
              'whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 cursor-pointer',
              isSelected
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            )}
          >
            {option === ALL_CATEGORIES ? 'All' : formatUtils.titleFromEnum(option)}
          </button>
        )
      })}
    </div>
  )
}
