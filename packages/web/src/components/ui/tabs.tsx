import * as TabsPrimitive from '@radix-ui/react-tabs'
import * as React from 'react'
import { cn } from '@/lib/utils/cn'

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    variant?: 'default' | 'underline' | 'pills'
  }
>(({ className, variant = 'default', ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-center text-muted-foreground',
      variant === 'default' && 'h-9 rounded-lg bg-muted p-1',
      variant === 'underline' && 'h-9 border-b border-border gap-4 bg-transparent p-0',
      variant === 'pills' && 'h-8 gap-1 bg-transparent p-0',
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    variant?: 'default' | 'underline' | 'pills'
  }
>(({ className, variant = 'default', ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
      variant === 'default' &&
        'rounded-md px-3 py-1 ring-offset-background data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs',
      variant === 'underline' &&
        'border-b-2 border-transparent px-2 py-2 data-[state=active]:border-primary data-[state=active]:text-foreground font-semibold',
      variant === 'pills' &&
        'rounded-md px-2.5 py-1 bg-transparent text-muted-foreground hover:bg-muted data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-medium',
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsContent, TabsList, TabsTrigger }
