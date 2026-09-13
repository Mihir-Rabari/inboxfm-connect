import { Building2, Moon, Palette, Shield, Sun, User } from 'lucide-react'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth/auth-context'
import { useTheme } from '@/lib/theme/theme-provider'
import { toast } from 'sonner'

export default function SettingsPage() {
  const { user, currentProject } = useAuth()
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Configure project preferences, developer identity, and console appearance."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Project Info */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <span>Project Information</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Current active project on InboxFM Connect platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Project Display Name</label>
              <Input defaultValue={currentProject?.displayName || 'InboxFM Main Project'} readOnly />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Project ID</label>
              <Input defaultValue={currentProject?.id || 'proj_default'} readOnly className="font-mono text-xs" />
            </div>
          </CardContent>
        </Card>

        {/* User Identity */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <span>Developer Identity</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Authenticated user details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Email Address</label>
              <Input defaultValue={user?.email || 'developer@inboxfm.local'} readOnly />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-foreground">Platform Role</label>
              <Input defaultValue={user?.platformRole || 'ADMIN'} readOnly />
            </div>
          </CardContent>
        </Card>

        {/* Appearance Settings */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <span>Console Appearance</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Customize the theme mode for this developer workstation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-foreground">Color Theme</span>
                <p className="text-[11px] text-muted-foreground">Select light, dark, or system mode.</p>
              </div>
              <div className="flex items-center gap-1.5 bg-muted/60 p-1 rounded-lg border border-border">
                <Button
                  size="xs"
                  variant={theme === 'light' ? 'default' : 'ghost'}
                  onClick={() => setTheme('light')}
                  className="gap-1 text-xs"
                >
                  <Sun className="h-3.5 w-3.5" />
                  <span>Light</span>
                </Button>
                <Button
                  size="xs"
                  variant={theme === 'dark' ? 'default' : 'ghost'}
                  onClick={() => setTheme('dark')}
                  className="gap-1 text-xs"
                >
                  <Moon className="h-3.5 w-3.5" />
                  <span>Dark</span>
                </Button>
                <Button
                  size="xs"
                  variant={theme === 'system' ? 'default' : 'ghost'}
                  onClick={() => setTheme('system')}
                  className="text-xs"
                >
                  <span>System</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security & Access */}
        <Card className="border-border shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span>Security & Isolation</span>
            </CardTitle>
            <CardDescription className="text-xs">
              Tenant boundary and execution sandboxing controls.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Every query and execution is isolated by <code className="font-mono text-primary font-bold">x-project-id</code> and validated through Fastify security middleware.
            </p>
            <Button size="sm" variant="outline" className="text-xs" onClick={() => toast.success('Security policies are active.')}>
              Inspect Security Policies
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
