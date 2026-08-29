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
} from '@/components/ui/command'

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()

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

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command or search destination..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => runCommand(() => navigate('/'))}
            className="cursor-pointer"
          >
            <LayoutGrid className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Overview Dashboard</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/integrations'))}
            className="cursor-pointer"
          >
            <Blocks className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Integrations Catalog</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/connections'))}
            className="cursor-pointer"
          >
            <KeyRound className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Connections & Credentials</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => navigate('/actions'))}
            className="cursor-pointer"
          >
            <Zap className="mr-2 h-4 w-4 text-muted-foreground" />
            <span>Actions & Tool Discovery</span>
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
      </CommandList>
    </CommandDialog>
  )
}
