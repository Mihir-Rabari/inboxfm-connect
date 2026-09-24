import { cn } from '@/lib/utils/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-md',
        className
      )}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" className="h-5 w-5" fill="none">
        <path d="M10 9H22V13H10V9ZM10 15H18V19H10V15ZM10 21H22V25H10V21Z" fill="currentColor" />
      </svg>
    </div>
  )
}
