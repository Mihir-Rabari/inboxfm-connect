import { AlertTriangle } from 'lucide-react'
import { ChangeEvent } from 'react'
import { Input } from '@/components/ui/input'
import { PieceProperty } from '@/lib/api/types'
import { cn } from '@/lib/utils/cn'

export interface AuthPropertyRendererProps {
  name: string
  property: PieceProperty
  value: unknown
  onChange: (value: unknown) => void
  error?: string
  disabled?: boolean
}

const SUPPORTED_TYPES = new Set([
  'SHORT_TEXT',
  'LONG_TEXT',
  'SECRET_TEXT',
  'NUMBER',
  'CHECKBOX',
  'STATIC_DROPDOWN',
])

function dropdownOptions(property: PieceProperty): Array<{ label: string; value: unknown }> {
  return Array.isArray(property.options?.options) ? property.options.options : []
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

export function AuthPropertyRenderer({
  name,
  property,
  value,
  onChange,
  error,
  disabled = false,
}: AuthPropertyRendererProps) {
  const fieldId = `auth-prop-${name}`
  const describedBy = property.description ? `${fieldId}-description` : undefined
  const showError = !!error

  const inputClassName = cn(showError && 'border-destructive focus-visible:ring-destructive/40')

  if (!SUPPORTED_TYPES.has(property.type)) {
    return (
      <div className="space-y-1" data-testid={`unsupported-prop-${name}`}>
        <label htmlFor={fieldId} className="text-xs font-medium text-foreground">
          {property.displayName}
          {property.required && <span aria-hidden="true"> *</span>}
        </label>
        <p
          id={describedBy}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-border bg-muted/40 p-2.5 text-xs text-muted-foreground"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          <span>
            This integration requires an unsupported credential field type ({property.type}). Connect it via the API instead.
          </span>
        </p>
      </div>
    )
  }

  const commonProps = {
    id: fieldId,
    'aria-describedby': describedBy,
    'aria-invalid': showError || undefined,
    disabled,
    required: property.required,
  }

  let control: React.ReactNode

  switch (property.type) {
    case 'LONG_TEXT': {
      control = (
        <textarea
          {...commonProps}
          rows={3}
          value={typeof value === 'string' ? value : ''}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
          className={cn(
            'flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
            inputClassName
          )}
        />
      )
      break
    }
    case 'SECRET_TEXT': {
      control = (
        <Input
          {...commonProps}
          type="password"
          autoComplete="new-password"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className={inputClassName}
        />
      )
      break
    }
    case 'NUMBER': {
      control = (
        <Input
          {...commonProps}
          type="number"
          value={typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''}
          onChange={(event) => {
            const raw = event.target.value
            onChange(raw === '' ? '' : Number(raw))
          }}
          className={inputClassName}
        />
      )
      break
    }
    case 'CHECKBOX': {
      control = (
        <div className="pt-0.5">
          <input
            {...commonProps}
            required={undefined}
            id={fieldId}
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
            disabled={disabled}
            className="h-4 w-4 cursor-pointer accent-[var(--primary)]"
          />
        </div>
      )
      break
    }
    case 'STATIC_DROPDOWN': {
      const options = dropdownOptions(property)
      const hasSelection = !(value === undefined || value === null || value === '')
      control = (
        <select
          {...commonProps}
          required={property.required && !hasSelection}
          value={hasSelection ? JSON.stringify(value ?? null) : ''}
          onChange={(event) => {
            if (event.target.value === '') {
              onChange('')
              return
            }
            try {
              onChange(JSON.parse(event.target.value))
            } catch {
              onChange(event.target.value)
            }
          }}
          className={cn(
            'flex h-9 w-full cursor-pointer rounded-md border border-input bg-card px-3 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
            inputClassName
          )}
        >
          {!hasSelection && (
            <option value="" disabled={!property.required}>
              Select an option...
            </option>
          )}
          {options.map((option) => (
            <option key={String(option.label)} value={JSON.stringify(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
      )
      break
    }
    default: {
      control = (
        <Input
          {...commonProps}
          type="text"
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          className={inputClassName}
        />
      )
    }
  }

  return (
    <div className="space-y-1.5">
      {property.type !== 'CHECKBOX' && (
        <label htmlFor={fieldId} className="block text-xs font-medium text-foreground">
          {property.displayName}
          {property.required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      {property.type === 'CHECKBOX' && (
        <label htmlFor={fieldId} className="flex cursor-pointer items-center gap-2 pt-0.5 text-xs font-medium text-foreground">
          {property.displayName}
          {property.required && <span aria-hidden="true"> *</span>}
        </label>
      )}
      {control}
      {property.description && !error && (
        <p id={describedBy} className="text-[11px] leading-relaxed text-muted-foreground">
          {property.description}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[11px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function validateAuthPropertyValue(property: PieceProperty, value: unknown): string | undefined {
  if (isMissing(value)) {
    return property.required ? `${property.displayName} is required` : undefined
  }
  if (property.type === 'NUMBER' && typeof value !== 'number' && isNaN(Number(value))) {
    return `${property.displayName} must be a number`
  }
  return undefined
}
