import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 select-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive/10 text-destructive border-destructive/20',
        success: 'border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        warning: 'border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        outline: 'text-foreground border-border bg-card',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
  dotClassName?: string
}

function Badge({ className, variant, dot = false, dotClassName, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            variant === 'success'
              ? 'bg-emerald-500'
              : variant === 'destructive'
              ? 'bg-destructive'
              : variant === 'warning'
              ? 'bg-amber-500'
              : 'bg-primary',
            dotClassName
          )}
        />
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
