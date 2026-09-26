import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { RouterProvider } from 'react-router-dom'
import { apiClient } from '@/lib/api/client'
import { AuthProvider } from '@/lib/auth/auth-context'
import { queryClient } from '@/lib/query/query-client'
import { ThemeProvider } from '@/lib/theme/theme-provider'
import { router } from '@/router'
import { mount, waitFor } from '@/test/test-utils'

function signIn(): void {
  apiClient.setToken('test-token')
  apiClient.setProjectId('project-1')
  localStorage.setItem('ap-token', 'test-token')
  localStorage.setItem('ap-project-id', 'project-1')
  localStorage.setItem(
    'ap-user',
    JSON.stringify({
      id: 'user-1',
      email: 'user@inboxfm.com',
      firstName: 'Test',
      lastName: 'User',
      platformId: 'default',
    })
  )
}

function signOut(): void {
  apiClient.setToken(null)
  apiClient.setProjectId(null)
  localStorage.clear()
}

function stubBackend(): void {
  const stubFetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input)
    const isArrayResponse =
      url.includes('/integrations') || url.includes('/trigger-bindings') || url.includes('/scheduled-tasks')

    let body: unknown
    if (url.includes('/projects')) {
      body = { data: [{ id: 'project-1', displayName: 'Default Project', platformId: 'default' }] }
    } else if (isArrayResponse) {
      body = []
    } else {
      body = { data: [] }
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  global.fetch = vi.fn(stubFetch)
}

async function navigateAndMount(path: string): Promise<HTMLElement> {
  await act(async () => {
    await router.navigate(path)
  })

  return mount(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

async function renderRouterAt(path: string): Promise<HTMLElement> {
  const container = await navigateAndMount(path)
  await waitFor(() => container.querySelector('aside') !== null)
  return container
}

describe('router', () => {
  beforeEach(() => {
    signOut()
    document.body.innerHTML = ''
    signIn()
    stubBackend()
  })

  it('renders the application shell at the index route', async () => {
    const container = await renderRouterAt('/')

    expect(container.querySelector('aside')).not.toBeNull()
    expect(container.textContent).toContain('Search integrations, tools, routes...')
  }, 15000)

  it('serves the dashboard page at /', async () => {
    const container = await renderRouterAt('/')

    await waitFor(() => container.textContent?.includes('Developer Quick Actions') === true)

    expect(container.textContent).toContain('Welcome back')
    expect(container.textContent).toContain('Available Tools')
  }, 15000)

  it('redirects unknown routes to the 404 page', async () => {
    const container = await renderRouterAt('/this-route-does-not-exist')

    await waitFor(() => document.body.textContent?.includes('404') === true)

    expect(container.querySelector('aside')).not.toBeNull()
    expect(document.body.textContent).toContain('404')
  }, 15000)

  it('serves the public landing page at /welcome without the app shell', async () => {
    const container = await navigateAndMount('/welcome')

    await waitFor(() => document.body.textContent?.includes('InboxFM Connect') === true)

    expect(container.querySelector('aside')).toBeNull()
    expect(document.body.textContent).toContain('Workflow automation built for')
    expect(document.body.querySelector('a[href="/login"]')).not.toBeNull()
  }, 15000)

  it('redirects unauthenticated users from protected routes to /login', async () => {
    signOut()
    const container = await navigateAndMount('/')

    await waitFor(() => document.body.textContent?.includes('Sign in') === true)

    expect(container.querySelector('aside')).toBeNull()
  }, 15000)
})
