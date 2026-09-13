import { act } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ActivityPage from './index'
import { stubApi, StubRoute } from '@/test/api-stub'
import {
  EXECUTIONS_PROJECT_ID,
  executionsListRoute,
  executionsPage,
  manualExecution,
  recordedExecution,
  scheduledExecution,
  triggerExecution,
} from '@/test/fixtures/executions'
import { createTestQueryClient, mount, waitFor } from '@/test/test-utils'
import { Toaster } from '@/components/ui/sonner'
import { apiClient } from '@/lib/api/client'

function UrlProbe() {
  const location = useLocation()
  return <span data-testid="url-probe">{location.search}</span>
}

function renderActivity(initialEntry = '/activity'): HTMLElement {
  const queryClient = createTestQueryClient()
  return mount(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Toaster position="bottom-right" richColors />
        <Routes>
          <Route path="/activity" element={<><ActivityPage /><UrlProbe /></>} />
          <Route path="/activity/:id" element={<div>execution detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function stubClipboard(): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  })
}

async function selectOption(selector: string, value: string): Promise<void> {
  const select = document.querySelector<HTMLSelectElement>(selector)
  expect(select).not.toBeNull()
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    setter?.call(select, value)
    select?.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function clickButton(testId: string): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)
  expect(button).not.toBeNull()
  await act(async () => {
    button?.click()
  })
}

function listRequests(calls: string[]): URL[] {
  return calls
    .map((call) => new URL(call))
    .filter((url) => url.pathname === '/api/v1/executions')
}

function bodyText(): string {
  return document.body.textContent ?? ''
}

describe('Activity page', () => {
  beforeEach(() => {
    localStorage.clear()
    apiClient.setProjectId(EXECUTIONS_PROJECT_ID)
    document.body.innerHTML = ''
    stubClipboard()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads executions and renders status, prompt, provenance, timestamp and count', async () => {
    const { calls } = stubApi([executionsListRoute([triggerExecution])])
    const container = renderActivity()

    await waitFor(() => container.querySelector('[data-testid="execution-row"]') !== null)

    const request = listRequests(calls)[0]
    expect(request.searchParams.get('projectId')).toBe(EXECUTIONS_PROJECT_ID)
    expect(request.searchParams.has('status')).toBe(false)

    expect(container.textContent).toContain(triggerExecution.prompt)
    expect(container.querySelector('[data-testid="execution-status-badge"]')?.textContent).toContain('Recorded')
    expect(container.querySelector('[data-testid="execution-provenance-badge"]')?.textContent).toContain('Trigger')
    expect(bodyText()).toMatch(/\d+m ago|just now/)
    expect(document.querySelector('[data-testid="activity-count"]')?.textContent).toContain('1 execution')
  })

  it('displays CREATED honestly as Recorded without fabricating completion', async () => {
    stubApi([executionsListRoute([recordedExecution])])
    const container = renderActivity()

    await waitFor(() => container.querySelector('[data-testid="execution-row"]') !== null)

    const badge = document.querySelector('[data-testid="execution-status-badge"]')
    expect(badge?.textContent).toContain('Recorded')
    expect(badge?.textContent).not.toContain('Completed')
    expect(badge?.textContent).not.toContain('Running')
    expect(bodyText()).toContain('CREATED')
  })

  it('sends the selected status filter and updates the URL', async () => {
    const { calls } = stubApi([
      executionsListRoute([]),
      { match: (url) => url.pathname === '/api/v1/executions', respond: () => ({ status: 200, body: executionsPage([]) }) },
    ])
    renderActivity()

    await waitFor(() => document.querySelector('[data-testid="activity-count"]') !== null)
    await selectOption('[data-testid="activity-status-filter"]', 'FAILED')

    await waitFor(() => {
      const requests = listRequests(calls)
      return requests.length > 0 && requests[requests.length - 1].searchParams.get('status') === 'FAILED'
    })

    expect(listRequests(calls).at(-1)?.searchParams.get('projectId')).toBe(EXECUTIONS_PROJECT_ID)
    expect(document.querySelector('[data-testid="url-probe"]')?.textContent).toContain('status=FAILED')
  }, 15000)

  it('sends the selected limit filter and updates the URL', async () => {
    const { calls } = stubApi([executionsListRoute([])])
    renderActivity()

    await waitFor(() => document.querySelector('[data-testid="activity-count"]') !== null)
    await selectOption('[data-testid="activity-limit-filter"]', '25')

    await waitFor(() => {
      const requests = listRequests(calls)
      return requests.length > 0 && requests[requests.length - 1].searchParams.get('limit') === '25'
    })

    expect(document.querySelector('[data-testid="url-probe"]')?.textContent).toContain('limit=25')
  }, 15000)

  it('omits the status parameter entirely while ALL is selected', async () => {
    const { calls } = stubApi([executionsListRoute([])])
    renderActivity()

    await waitFor(() => document.querySelector('[data-testid="activity-count"]') !== null)

    const request = listRequests(calls)[0]
    expect(request.searchParams.has('status')).toBe(false)
  })

  it('restores filters from a deep link', async () => {
    const { calls } = stubApi([executionsListRoute([])])
    const container = renderActivity('/activity?status=FAILED&limit=25')

    await waitFor(() => document.querySelector('[data-testid="activity-count"]') !== null)

    const statusSelect = container.querySelector<HTMLSelectElement>('[data-testid="activity-status-filter"]')
    const limitSelect = container.querySelector<HTMLSelectElement>('[data-testid="activity-limit-filter"]')
    expect(statusSelect?.value).toBe('FAILED')
    expect(limitSelect?.value).toBe('25')

    const request = listRequests(calls)[0]
    expect(request.searchParams.get('status')).toBe('FAILED')
    expect(request.searchParams.get('limit')).toBe('25')
  })

  it('falls back to defaults for unsupported URL values', async () => {
    const { calls } = stubApi([executionsListRoute([])])
    const container = renderActivity('/activity?status=WAT&limit=9999')

    await waitFor(() => document.querySelector('[data-testid="activity-count"]') !== null)

    const statusSelect = container.querySelector<HTMLSelectElement>('[data-testid="activity-status-filter"]')
    const limitSelect = container.querySelector<HTMLSelectElement>('[data-testid="activity-limit-filter"]')
    expect(statusSelect?.value).toBe('ALL')
    expect(limitSelect?.value).toBe('10')

    const request = listRequests(calls)[0]
    expect(request.searchParams.has('status')).toBe(false)
    expect(request.searchParams.get('limit')).toBe('10')
  })

  it('shows the empty state when no executions exist', async () => {
    stubApi([executionsListRoute([])])
    const container = renderActivity()

    await waitFor(() => bodyText().includes('No executions recorded yet.'))

    expect(container.textContent).toContain('No executions recorded yet.')
  })

  it('shows the filtered empty state distinct from the plain empty state', async () => {
    stubApi([executionsListRoute([])])
    const container = renderActivity('/activity?status=COMPLETED')

    await waitFor(() => bodyText().includes('No executions match this filter.'))

    expect(container.textContent).toContain('No executions match this filter.')
    expect(container.textContent).not.toContain('No executions recorded yet.')
  })

  it('renders an error state when the backend fails', async () => {
    stubApi([{ match: (url) => url.pathname === '/api/v1/executions', respond: () => ({ status: 500, body: { message: 'boom' } }) }])
    const container = renderActivity()

    await waitFor(() => document.querySelector('[data-testid="activity-error"]') !== null)

    expect(container.textContent).toContain('Unable to load executions')
  })

  it('recovers through the retry action after a failure', async () => {
    let failing = true
    const routes: StubRoute[] = [
      {
        match: (url) => url.pathname === '/api/v1/executions',
        respond: () =>
          failing
            ? { status: 500, body: { message: 'boom' } }
            : { status: 200, body: executionsPage([recordedExecution]) },
      },
    ]
    stubApi(routes)
    const container = renderActivity()

    await waitFor(() => document.querySelector('[data-testid="activity-error"]') !== null)

    failing = false
    const retryButton = Array.from(
      document.querySelector('[data-testid="activity-error"]')?.querySelectorAll('button') ?? [],
    ).find((candidate) => candidate.textContent?.includes('Try again'))
    expect(retryButton).not.toBeNull()
    await act(async () => {
      retryButton?.click()
    })

    await waitFor(() => document.querySelector('[data-testid="execution-row"]') !== null)
    expect(container.textContent).toContain(recordedExecution.prompt)
  }, 15000)

  it('derives provenance badges only from verified metadata conventions', async () => {
    stubApi([executionsListRoute([triggerExecution, scheduledExecution, manualExecution])])
    const container = renderActivity()

    await waitFor(() => document.querySelectorAll('[data-testid="execution-row"]').length === 3)

    const provenanceBadges = Array.from(container.querySelectorAll('[data-testid="execution-provenance-badge"]'))
      .map((badge) => badge.textContent ?? '')
    expect(provenanceBadges.some((text) => text.includes('Trigger'))).toBe(true)
    expect(provenanceBadges.some((text) => text.includes('Scheduled'))).toBe(true)
    expect(provenanceBadges.some((text) => text.includes('Manual/API'))).toBe(true)
    expect(provenanceBadges.some((text) => text.includes('MCP'))).toBe(false)
  })

  it('does not render unsupported pagination, duration, token or cost UI', async () => {
    stubApi([executionsListRoute([recordedExecution])])
    const container = renderActivity()

    await waitFor(() => document.querySelector('[data-testid="execution-row"]') !== null)

    const text = bodyText()
    expect(text).not.toContain('Duration')
    expect(text).not.toContain('Tokens')
    expect(text).not.toContain('Cost')
    expect(text.toLowerCase()).not.toContain('next page')
    expect(container.querySelector('[data-testid*="pagination"]')).toBeNull()
  })

  it('copies an execution ID via the row action', async () => {
    stubApi([executionsListRoute([recordedExecution])])
    renderActivity()

    await waitFor(() => document.querySelector('[data-testid="copy-execution-id"]') !== null)
    await clickButton('copy-execution-id')

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(recordedExecution.id)
  })
})
