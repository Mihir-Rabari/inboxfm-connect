import { Blocks, Code2, ShieldCheck } from 'lucide-react'

const stats = [
  { icon: Blocks, label: '400+ integrations' },
  { icon: Code2, label: 'TypeScript 5.0, end to end' },
  { icon: ShieldCheck, label: 'MIT + dual license' },
]

export function WelcomeStats() {
  return (
    <div className="border-b border-border/80 bg-card/40">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4 py-8 sm:px-6 lg:px-8">
        {stats.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Icon className="h-4 w-4 text-primary" />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
