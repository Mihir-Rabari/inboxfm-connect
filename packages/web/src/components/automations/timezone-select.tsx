import { Globe } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils/cn'

export interface TimezoneSelectProps {
  id?: string
  value: string
  onChange: (timezone: string) => void
  disabled?: boolean
  error?: string
}

function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  } catch {
    return null
  }
}

function allTimezones(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone')
    }
  } catch {
    // fall through to the curated default below
  }
  return ['UTC']
}

export function TimezoneSelect({ id, value, onChange, disabled = false, error }: TimezoneSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const timezones = useMemo(() => allTimezones(), [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle === '') {
      return timezones
    }
    return timezones.filter((tz) => tz.toLowerCase().includes(needle))
  }, [query, timezones])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(0)
      return undefined
    }
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    const option = listRef.current?.children[activeIndex] as HTMLElement | undefined
    option?.scrollIntoView?.({ block: 'nearest' })
  }, [activeIndex])

  function commit(timezone: string) {
    onChange(timezone)
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'Enter') {
        setOpen(true)
        event.preventDefault()
      }
      return
    }
    switch (event.key) {
      case 'Escape':
        setOpen(false)
        event.preventDefault()
        break
      case 'ArrowDown':
        setActiveIndex((index) => Math.min(index + 1, filtered.length - 1))
        event.preventDefault()
        break
      case 'ArrowUp':
        setActiveIndex((index) => Math.max(index - 1, 0))
        event.preventDefault()
        break
      case 'Enter': {
        const selected = filtered[activeIndex]
        if (selected) {
          commit(selected)
        }
        event.preventDefault()
        break
      }
      default:
        break
    }
  }

  const listId = id ? `${id}-listbox` : undefined

  return (
    <div className="relative" ref={rootRef} data-testid="timezone-select">
      <div className="relative">
        <Globe className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          disabled={disabled}
          value={open ? query : value}
          placeholder="Search timezones..."
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
            setOpen(true)
          }}
          className={cn(
            'h-9 w-full cursor-text rounded-md border bg-card pl-9 pr-3 font-mono text-xs shadow-xs transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
            error ? 'border-destructive' : 'border-input'
          )}
        />
      </div>
      {open && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          aria-label="Timezones"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md"
        >
          {filtered.length === 0 && (
            <li className="px-2 py-3 text-center text-xs text-muted-foreground">No timezone matches.</li>
          )}
          {filtered.map((tz, index) => (
            <li key={tz}>
              <button
                type="button"
                role="option"
                aria-selected={tz === value}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(tz)}
                className={cn(
                  'flex w-full items-center justify-between rounded px-2 py-1.5 text-left font-mono text-xs transition-colors',
                  index === activeIndex ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                )}
              >
                <span>{tz}</span>
                {tz === value && <span className="text-[10px] font-semibold uppercase">Current</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        The cron expression is evaluated in this timezone.
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-[11px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export const timezoneUtils = { browserTimezone }
