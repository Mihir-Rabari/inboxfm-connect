import { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils/cn'

interface FormFieldProps {
  id: string
  label: string
  error?: string
  description?: string
  hint?: string
  required?: boolean
  children?: ReactNode
}

export function FormFieldLabel({ id, label, required }: Omit<FormFieldProps, 'error' | 'description' | 'children'>) {
  return (
    <label htmlFor={id} className="block text-xs font-medium text-foreground">
      {label}
      {required && <span aria-hidden="true"> *</span>}
    </label>
  )
}

interface TextFieldProps extends FormFieldProps {
  type?: 'text' | 'password' | 'number'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  disabled?: boolean
  invalid?: boolean
  min?: number
  step?: string
}

export function TextField({
  id,
  label,
  error,
  description,
  hint,
  required = false,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled = false,
  invalid,
}: TextFieldProps) {
  const showError = !!error || !!invalid
  return (
    <div className="space-y-1.5">
      <FormFieldLabel id={id} label={label} required={required} />
      <Input
        id={id}
        type={type}
        thin={false}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={showError || undefined}
        aria-describedby={description ? `${id}-description` : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cn(showError && 'border-destructive focus-visible:ring-destructive/40')}
      />
      {description && !error && (
        <p id={`${id}-description`} className="text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[11px] font-medium text-destructive">
          {error}
        </p>
      )}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}
