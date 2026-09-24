import { Bot, Code2, ShieldCheck, Table2, Users, Zap } from 'lucide-react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface FeatureItem {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}

const features: FeatureItem[] = [
  {
    icon: Bot,
    title: 'Native MCP support',
    description:
      'Every integration automatically acts as an MCP server — connect Claude, Cursor, Windsurf, or any custom agent to 400+ external services.',
  },
  {
    icon: Code2,
    title: 'Type-safe integrations framework',
    description:
      'Write custom actions and triggers in TypeScript with @inboxfm-connect/pieces-framework, complete with hot-reloading.',
  },
  {
    icon: Table2,
    title: 'Headless data tables',
    description:
      'A built-in relational storage service — Table, Field, Record, Cell — for structured data persistence without a spreadsheet UI in the way.',
  },
  {
    icon: Users,
    title: 'Strict multi-tenancy',
    description:
      'Tenant isolation across Platform → Project → User, enforced on every single query for teams of any size.',
  },
  {
    icon: ShieldCheck,
    title: 'Security by design',
    description:
      'Built-in SSRF protection, scoped API keys, and role-based access control — not bolted on after the fact.',
  },
  {
    icon: Zap,
    title: 'Built for performance',
    description:
      'A Fastify REST API, TypeORM-managed PostgreSQL, and BullMQ/Redis power reliable, async job processing.',
  },
]

export function WelcomeFeatures() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Everything you need to connect AI to the real world
        </h2>
        <p className="mt-4 text-base text-muted-foreground">
          Straight from the project itself — no invented claims, just what Inboxfm Connect actually ships.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, description }) => (
          <Card key={title} className="h-full">
            <CardHeader>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <CardTitle className="mt-3">{title}</CardTitle>
              <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  )
}
