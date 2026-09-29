import {
  Activity,
  Blocks,
  Bot,
  CalendarClock,
  Code2,
  KeyRound,
  LayoutGrid,
  Radio,
  Settings,
  Search,
  Zap,
} from 'lucide-react'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { useConnectionsQuery } from '@/lib/query/hooks'
import { useTriggerBindingsQuery } from '@/lib/query/hooks'
import { useScheduledTasksQuery } from '@/lib/query/hooks'
import { useExecutionsQuery } from '@/lib/query/hooks'
import type { AppConnectionWithoutSensitiveData, TriggerBinding, ScheduledTask, Execution } from '@inboxfm-connect/shared'

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()

  // Fetch project resources for search
  const { data: connectionsData, isLoading: isConnectionsLoading } = useConnectionsQuery()
  const { data: triggerBindings, isLoading: isTriggerBindingsLoading } = useTriggerBindingsQuery()
  const { data: scheduledTasks, isLoading: isScheduledTasksLoading } = useScheduledTasksQuery()
  const { data: executions, isLoading: isExecutionsLoading } = useExecutionsQuery({ limit: 20 })

  // Extract data arrays
  const connections = connectionsData?.data || []
  const triggerBindingsList = triggerBindings || []
  const scheduledTasksList = scheduledTasks || []
  const executionsList = executions?.data || []

  // Track if any resource is loading
  const isLoading = isConnectionsLoading || isTriggerBindingsLoading || isScheduledTasksLoading || isExecutionsLoading

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [open, onOpenChange])

  const runCommand = React.useCallback(
    (command: () => unknown) => {
      onOpenChange(false)
      command()
    },
    [onOpenChange]
  )

  // Filter resources based on search input
  // We'll use the CommandInput's built-in filtering by providing the right items
  // But we need to combine navigation + resource results

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search integrations, tools, routes, connections, executions..." />
      <CommandList>
        {/* Navigation Group - always shown */}
        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => runCommand(() => navigate('/'))}
            className="cursor-pointer"
          >
            <LayoutGrid className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Overview Dashboard</span>
            <CommandShortcut className="text-xs opacity-60">⌘1</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/integrations'))}
            className="cursor-pointer"
          >
            <Blocks className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Integrations Catalog</span>
            <CommandShortcut className="text-xs opacity-60">⌘2</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/connections'))}
            className="cursor-pointer"
          >
            <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Connections & Credentials</span>
            <CommandShortcut className="text-xs opacity-60">⌘3</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/actions'))}
            className="cursor-pointer"
          >
            <Zap className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Actions & Tool Discovery</span>
            <CommandShortcut className="text-xs opacity-60">⌘4</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/triggers'))}
            className="cursor-pointer"
          >
            <Radio className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Triggers & Event Capabilities</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/automations/triggers'))}
            className="cursor-pointer"
          >
            <Radio className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Trigger Bindings</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/automations/schedules'))}
            className="cursor-pointer"
          >
            <CalendarClock className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Scheduled Tasks</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/mcp'))}
            className="cursor-pointer"
          >
            <Bot className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>MCP Server & Tools</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Monitoring & Platform">
          <CommandItem
            onSelect={() => runCommand(() => navigate('/activity'))}
            className="cursor-pointer"
          >
            <Activity className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Activity & Execution Logs</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/developers'))}
            className="cursor-pointer"
          >
            <Code2 className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Developer SDK & API Reference</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/settings'))}
            className="cursor-pointer"
          >
            <Settings className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Project Settings</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Resource Search Results - filtered by CommandInput */}
        {isLoading && (
          <CommandGroup heading="Loading...">
            <CommandItem disabled className="cursor-wait flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
              <span className="text-muted-foreground">Loading resources...</span>
            </CommandItem>
          </CommandGroup>
        )}

        {!isLoading && connections.length > 0 && (
          <CommandGroup heading="Connections">
            {connections.map((connection: AppConnectionWithoutSensitiveData) => (
              <CommandItem
                key={connection.id}
                onSelect={() => runCommand(() => navigate(`/connections/${connection.id}`))}
                className="cursor-pointer"
              >
                <KeyRound className="mr-2 h-4 w-4 text-emerald-500" />
                <span>{connection.displayName}</span>
                <CommandShortcut className="text-xs opacity-60 ml-auto">
                  {connection.pieceName}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!isLoading && triggerBindingsList.length > 0 && (
          <CommandGroup heading="Trigger Bindings">
            {triggerBindingsList.map((binding: TriggerBinding) => (
              <CommandItem
                key={binding.id}
                onSelect={() => runCommand(() => navigate(`/automations/triggers/${binding.id}`))}
                className="cursor-pointer"
              >
                <Radio className="mr-2 h-4 w-4 text-amber-500" />
                <span>{binding.displayName || binding.name || binding.id}</span>
                <CommandShortcut className="text-xs opacity-60 ml-auto">
                  {binding.pieceName}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!isLoading && scheduledTasksList.length > 0 && (
          <CommandGroup heading="Scheduled Tasks">
            {scheduledTasksList.map((task: ScheduledTask) => (
              <CommandItem
                key={task.id}
                onSelect={() => runCommand(() => navigate(`/automations/schedules/${task.id}`))}
                className="cursor-pointer"
              >
                <CalendarClock className="mr-2 h-4 w-4 text-purple-500" />
                <span>{task.displayName || task.name || task.id}</span>
                <CommandShortcut className="text-xs opacity-60 ml-auto">
                  {task.cronExpression || 'cron'}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!isLoading && executionsList.length > 0 && (
          <CommandGroup heading="Recent Executions">
            {executionsList.map((execution: Execution) => (
              <CommandItem
                key={execution.id}
                onSelect={() => runCommand(() => navigate(`/activity/${execution.id}`))}
                className="cursor-pointer"
              >
                <Activity className="mr-2 h-4 w-4 text-primary" />
                <span className="truncate max-w-[200px]">
                  {execution.prompt || 'Direct Execution'}
                </span>
                <CommandShortcut className="text-xs opacity-60 ml-auto">
                  {execution.status}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!isLoading && connections.length === 0 && triggerBindingsList.length === 0 && scheduledTasksList.length === 0 && executionsList.length === 0 && (
          <CommandEmpty>
            <Search className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="text-center text-sm text-muted-foreground mt-2">
              No project resources found. Create connections, trigger bindings, or scheduled tasks to search them.
            </p>
          </CommandEmpty>
        )}

        {/* No matches empty state when filtered */}
        {!isLoading && (
          <CommandEmpty>
            No matching resources found.
          </CommandEmpty>
        )}
      </CommandList>
    </CommandDialog>
  )
}
