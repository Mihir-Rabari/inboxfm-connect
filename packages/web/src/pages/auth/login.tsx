import { Lock, Mail } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/auth-context'
import { toast } from 'sonner'

export default function LoginPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // The sign-in response is FLAT: the user fields, `token` and `projectId` sit
      // at the top level — there is no nested `user`. Verified against the running
      // backend (`authenticationService.signInWithPassword` returns the user row with
      // `token`/`projectId` merged in).
      const res = await apiClient.post<{
        id: string
        email: string
        firstName: string
        lastName: string
        platformRole?: string
        token: string
        projectId: string
      }>('/authentication/sign-in', {
        email,
        password,
      })

      const { token, projectId, ...user } = res
      signIn(token, user, projectId)
      toast.success('Signed in successfully')
      navigate('/')
    } catch (err) {
      toast.error('Authentication failed', {
        description: err instanceof Error ? err.message : 'Invalid credentials',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm border-border shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold mb-2 shadow-xs">
            <span>IF</span>
          </div>
          <CardTitle className="text-lg font-bold">InboxFM Connect</CardTitle>
          <CardDescription className="text-xs">
            Sign in to your developer console
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Email</label>
              <Input
                type="email"
                icon={<Mail className="h-4 w-4" />}
                placeholder="developer@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Password</label>
              <Input
                type="password"
                icon={<Lock className="h-4 w-4" />}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" loading={isLoading} className="w-full mt-2 font-semibold shadow-xs">
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
