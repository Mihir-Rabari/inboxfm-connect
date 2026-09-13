import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth/auth-context'
import { ThemeProvider } from '@/lib/theme/theme-provider'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

const mountedRoots: Array<() => void> = []

afterEach(() => {
  while (mountedRoots.length > 0) {
    const unmount = mountedRoots.pop()
    unmount?.()
  }
})

export function mount(ui: React.ReactElement): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let done = false
  mountedRoots.push(() => {
    if (done) return
    done = true
    act(() => root.unmount())
    container.remove()
  })
  act(() => {
    root.render(ui)
  })
  return container
}

interface MountAtOptions {
  route?: string
  withProviders?: boolean
}

export function mountAt(
  ui: React.ReactElement,
  { route = '/', withProviders = true }: MountAtOptions = {}
): HTMLElement {
  const tree = (
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="*" element={ui} />
      </Routes>
    </MemoryRouter>
  )

  return mount(
    withProviders ? (
      <ThemeProvider defaultTheme="light">
        <AuthProvider>{tree}</AuthProvider>
      </ThemeProvider>
    ) : (
      tree
    )
  )
}

export async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: condition not met within timeout')
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25))
    })
  }
}

export function queryText(container: HTMLElement, text: string): HTMLElement | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const parent = walker.currentNode.parentElement
    if (parent && walker.currentNode.nodeValue?.trim() === text) {
      return parent
    }
  }
  return null
}
