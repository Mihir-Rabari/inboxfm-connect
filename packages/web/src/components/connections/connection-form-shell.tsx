import { AlertTriangle } from 'lucide-react'
import { ReactNode } from 'react'
import { PieceLogo } from '@/components/connections/piece-logo'
import { Button } from '@/components/ui/button'

interface ConnectionFormShellProps {
  pieceDisplayName: string
  pieceLogoUrl?: string
  title: string
  description?: string
  submitLabel: string
  pending?: boolean
  disabled?: boolean
  errorMessage?: string
  onSubmit: (event?: React.BaseSyntheticEvent) => void
  children: ReactNode
}

export function ConnectionFormShell({
  pieceDisplayName,
  pieceLogoUrl,
  title,
  description,
  submitLabel,
  pending = false,
  disabled = false,
  errorMessage,
  onSubmit,
  children,
}: ConnectionFormShellProps) {
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-busy={pending}
      className="max-w-xl space-y-5"
    >
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
        <PieceLogo logoUrl={pieceLogoUrl} pieceDisplayName={pieceDisplayName} />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-xs">
        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}
        {children}
        <Button type="submit" size="sm" className="w-full sm:w-auto" loading={pending} disabled={disabled}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
