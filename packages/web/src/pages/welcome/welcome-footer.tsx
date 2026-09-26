import { Github } from 'lucide-react'
import { Link } from 'react-router-dom'
import { LogoMark } from './logo-mark'
import { welcomeLinks } from './welcome-links'

interface FooterColumn {
  title: string
  links: { label: string; href: string; external?: boolean }[]
}

const columns: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Sign In', href: '/login' },
      { label: 'Features', href: '#features' },
      { label: 'Repository', href: welcomeLinks.githubRepo, external: true },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'README', href: welcomeLinks.githubReadme, external: true },
      { label: 'Architecture', href: welcomeLinks.githubArchitecture, external: true },
      { label: 'Contributing', href: welcomeLinks.githubContributing, external: true },
    ],
  },
  {
    title: 'Legal & Security',
    links: [
      { label: 'License', href: welcomeLinks.githubLicense, external: true },
      { label: 'Licensing details', href: welcomeLinks.githubLicensing, external: true },
      { label: 'Security policy', href: welcomeLinks.githubSecurity, external: true },
      { label: 'Report an issue', href: welcomeLinks.githubIssues, external: true },
    ],
  },
]

export function WelcomeFooter() {
  return (
    <footer className="border-t border-border/80 bg-background">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2.5">
              <LogoMark className="h-8 w-8" />
              <span className="text-sm font-bold tracking-tight">InboxFM Connect</span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Open-source, AI-first workflow automation. A fork of Activepieces, stripped down to a headless,
              MCP-first execution model.
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{column.title}</h3>
              <ul className="mt-3 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        to={link.href}
                        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-border/80 pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Inboxfm Connect. Dual-licensed — see{' '}
            <a
              href={welcomeLinks.githubLicensing}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              LICENSING.md
            </a>
            .
          </p>
          <a
            href={welcomeLinks.githubRepo}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Github className="h-3.5 w-3.5" />
            <span>Mihir-Rabari/inboxfm-connect</span>
          </a>
        </div>
      </div>
    </footer>
  )
}
