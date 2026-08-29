import { KeyRound } from 'lucide-react'

interface PieceLogoProps {
  logoUrl?: string
  pieceDisplayName?: string
  className?: string
}

export function PieceLogo({ logoUrl, pieceDisplayName, className = 'h-9 w-9' }: PieceLogoProps) {
  const sizeClass = `${className} shrink-0 rounded-md border border-border bg-card`

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={pieceDisplayName ? `${pieceDisplayName} logo` : ''}
        loading="lazy"
        decoding="async"
        className={`${sizeClass} object-contain p-1`}
      />
    )
  }
  return (
    <div
      className={`${sizeClass} flex items-center justify-center`}
      role="img"
      aria-label={pieceDisplayName ? `${pieceDisplayName} logo` : 'Integration logo'}
    >
      <KeyRound className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
    </div>
  )
}
