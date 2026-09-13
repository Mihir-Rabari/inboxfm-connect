import { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils/cn'

export const INTEGRATION_TAB_VALUES = ['overview', 'actions', 'triggers', 'connections'] as const

export type IntegrationTabValue = (typeof INTEGRATION_TAB_VALUES)[number]

export function isIntegrationTabValue(value: string): value is IntegrationTabValue {
  return (INTEGRATION_TAB_VALUES as readonly string[]).includes(value)
}

interface IntegrationTabsProps {
  value: IntegrationTabValue
  onValueChange: (value: IntegrationTabValue) => void
  counts: {
    actions: number
    triggers: number
    connections: number | null
  }
  overview: ReactNode
  actions: ReactNode
  triggers: ReactNode
  connections: ReactNode
}

function countLabel(count: number | null): string {
  return count === null ? '' : ` (${count})`
}

export function IntegrationTabs({
  value,
  onValueChange,
  counts,
  overview,
  actions,
  triggers,
  connections,
}: IntegrationTabsProps) {
  const handleTabChange = (raw: string) => {
    if (isIntegrationTabValue(raw)) {
      onValueChange(raw)
    }
  }

  return (
    <Tabs value={value} onValueChange={handleTabChange} className="w-full">
      <TabsList variant="underline" className="w-full justify-start overflow-x-auto">
        <TabsTrigger value="overview" variant="underline">
          Overview
        </TabsTrigger>
        <TabsTrigger value="actions" variant="underline">
          Actions{countLabel(counts.actions)}
        </TabsTrigger>
        <TabsTrigger value="triggers" variant="underline">
          Triggers{countLabel(counts.triggers)}
        </TabsTrigger>
        <TabsTrigger value="connections" variant="underline">
          Connections{counts.connections === null ? '' : countLabel(counts.connections)}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className={cn('space-y-4 pt-4')}>
        {overview}
      </TabsContent>
      <TabsContent value="actions" className={cn('space-y-4 pt-4')}>
        {actions}
      </TabsContent>
      <TabsContent value="triggers" className={cn('space-y-4 pt-4')}>
        {triggers}
      </TabsContent>
      <TabsContent value="connections" className={cn('space-y-4 pt-4')}>
        {connections}
      </TabsContent>
    </Tabs>
  )
}
