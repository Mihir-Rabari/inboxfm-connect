import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ScheduledTasksPage from './schedules'
import NewScheduledTaskPage from './schedules-new'
import EditScheduledTaskPage from './schedules-edit'
import ScheduledTaskDetailPage from './schedules-detail'
import { createTestQueryClient, mount, waitFor } from '@/test/test-utils'
import { slackScheduledTask } from '@/test/fixtures/automations'
import { Execution, ScheduledTask } from '@/lib/api/types'

interface RecordedRequest {
  url: string
  method: string
  body?: unknown
}

interface MockBackend {
  requests: RecordedRequest[]
  tasks: ScheduledTask[]
  deletedIds: string[]
  install(): void
  restore(): void
}

function createMockBackend(options: { tasks?: ScheduledTask[]; listStatus?: number } = {}): MockBackend {
  const requests: RecordedRequest[] = []
  const tasks: ScheduledTask[] =
    options.tasks !== undefined ? options.tasks.map((task) => ({ ...task })) : [slackScheduledTask()]
  const deletedIds: string[] = []
  const originalFetch = global.fetch
  const listStatus = options.listStatus ?? 200

  function parseBody(init?: RequestInit): unknown {
    if (typeof init?.body !== 'string') return undefined
    try {
      return JSON.parse(init.body)
    } catch {
      return undefined
    }
  }

  function idFrom(pathname: string): string {
    return pathname.replace('/api/v1/scheduled-tasks/', '').split('/')[0]
  }

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }

  function execution(id: string): Execution {
    return {
      id,
      created: '2026-06-01T12:00:00.000Z',
      updated: '2026-06-01T12:00:00.000Z',
      projectId: 'proj_default',
      platformId: 'plat_default',
      status: 'CREATED',
      prompt: 'Summarize unread inbox and post the digest.',
      metadata: { scheduledTaskId: id },
    }
  }

  async function handler(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const raw = String(input)
    const url = new URL(raw, 'http://localhost')
    const method = init?.method ?? 'GET'
    const parsedBody = parseBody(init)
    requests.push({ url: raw, method, body: parsedBody })

    if (url.pathname === '/api/v1/scheduled-tasks' && method === 'GET') {
      if (listStatus >= 400) {
        return json({ message: 'scheduler unreachable' }, listStatus)
      }
      return json({ data: [...tasks], next: null, previous: null })
    }
    if (url.pathname === '/api/v1/scheduled-tasks' && method === 'POST') {
      const created: ScheduledTask = {
        id: 'st_new',
        created: '2026-06-01T00:00:00.000Z',
        updated: '2026-06-01T00:00:00.000Z',
        projectId: 'proj_default',
        platformId: 'plat_default',
        prompt: String((parsedBody as Record<string, unknown>).prompt),
        cronExpression: String((parsedBody as Record<string, unknown>).cronExpression),
        timezone: String((parsedBody as Record<string, unknown>).timezone),
        status: ((parsedBody as Record<string, unknown>).status as ScheduledTask['status']) ?? 'ENABLED',
        lastRunAt: null,
        nextRunAt: null,
      }
      tasks.push(created)
      return json(created, 201)
    }
    if (/^\/api\/v1\/scheduled-tasks\/[^/]+\/run$/.test(url.pathname)) {
      return json(execution('exec_run_now'))
    }
    if (/^\/api\/v1\/scheduled-tasks\/[^/]+$/.test(url.pathname) && method === 'DELETE') {
      const index = tasks.findIndex((task) => task.id === idFrom(url.pathname))
      if (index >= 0) {
        deletedIds.push(tasks[index].id)
        tasks.splice(index, 1)
      }
      return new Response(null, { status: 204 })
    }
    if (/^\/api\/v1\/scheduled-tasks\/[^/]+$/.test(url.pathname)) {
      const id = idFrom(url.pathname)
      const index = tasks.findIndex((task) => task.id === id)
      if (index === -1) {
        return json({ message: 'not found' }, 404)
      }
      if (method === 'POST') {
        tasks[index] = {
          ...tasks[index],
          ...(parsedBody as Partial<ScheduledTask>),
          updated: new Date().toISOString(),
        }
      }
      return json(tasks[index])
    }
    return json({ message: `unhandled ${method} ${raw}` }, 404)
  }

  return {
    requests,
    tasks,
    deletedIds,
    install() {
      global.fetch = vi.fn(handler) as unknown as typeof fetch
    },
    restore() {
      global.fetch = originalFetch
    },
  }
}

async function setInputValue(container: HTMLElement, selector: string, value: string): Promise<void> {
  const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
  expect(element).not.toBeNull()
  await act(async () => {
    const proto =
      element instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set
    setter?.call(element, value)
    element?.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function clickButton(container: HTMLElement, selector: string): Promise<void> {
  const button = container.querySelector<HTMLButtonElement>(selector)
  expect(button).not.toBeNull()
  await act(async () => {
    button?.click()
  })
}

async function clickButtonWithText(container: HTMLElement, label: string): Promise<void> {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.includes(label)
  )
  expect(button).toBeTruthy()
  await act(async () => {
    button?.click()
  })
}

describe('Scheduled tasks', () => {
  let backend: MockBackend
  const cleanups: Array<() => void> = []

  function setupBackend(options?: { tasks?: ScheduledTask[]; listStatus?: number }): MockBackend {
    const instance = createMockBackend(options)
    instance.install()
    cleanups.push(() => instance.restore())
    return instance
  }

  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
    backend = setupBackend()
  })

  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.()
    }
  })

  it('hub lists tasks with schedule details and status', async () => {
    backend.restore()
    backend = setupBackend()
    const container = renderHub()

    await waitFor(() => container.querySelector('[data-testid="scheduled-task-row"]') !== null)

    expect(container.textContent).toContain('Summarize unread inbox and post the digest.')
    expect(container.textContent).toContain('0 8 * * *')
    expect(container.textContent).toContain('Asia/Kolkata')
    expect(container.querySelector('[data-testid="automation-status-enabled"]')).not.toBeNull()
  }, 15000)

  it('hub shows an empty state when no tasks exist', async () => {
    backend.restore()
    backend = setupBackend({ tasks: [] })
    const container = renderHub()

    await waitFor(
      () => container.textContent?.includes('No scheduled tasks configured') === true
    )
  }, 15000)

  it('hub shows an error state when the list fails', async () => {
    backend.restore()
    backend = setupBackend({ listStatus: 500 })
    const container = renderHub()

    await waitFor(() => container.textContent?.includes('Unable to load scheduled tasks') === true)
  }, 15000)

  it('creates a task through presets, timezone search and an exact payload', async () => {
    backend.restore()
    backend = setupBackend({ tasks: [] })
    const requests = backend.requests
    const container = renderNew()

    await waitFor(
      () => container.querySelector('[data-testid="schedule-prompt-input"]') !== null
    )

    await setInputValue(container, '[data-testid="schedule-prompt-input"]', 'Daily digest')

    await waitFor(() => container.querySelector('[data-testid="schedule-builder"]') !== null)

    await clickButtonWithText(container, 'Every day')

    await waitFor(() => container.querySelector('[data-testid="cron-description"]') !== null)
    expect(container.querySelector('[data-testid="cron-description"]')?.textContent).toContain('8:00')

    const chosenZone = await pickTimezone(container, ['Asia/Kolkata', 'Asia/Calcutta', 'Europe/London'])

    await waitFor(
      () =>
        container
          .querySelector('[data-testid="schedule-summary"]')
          ?.textContent?.includes(chosenZone) === true
    )

    await clickButton(container, '[data-testid="submit-schedule"]')

    const createRequest = requests.find(
      (request) =>
        request.method === 'POST' && request.url.includes('/api/v1/scheduled-tasks')
    )
    expect(createRequest).toBeTruthy()
    expect(createRequest?.body).toEqual({
      prompt: 'Daily digest',
      cronExpression: '0 8 * * *',
      timezone: chosenZone,
      status: 'ENABLED',
    })
  }, 20000)

  it('rejects invalid raw cron without calling the API', async () => {
    backend.restore()
    backend = setupBackend({ tasks: [] })
    const requests = backend.requests
    const container = renderNew()

    await waitFor(() => container.querySelector('[data-testid="schedule-prompt-input"]') !== null)

    await setInputValue(container, '[data-testid="schedule-prompt-input"]', 'Broken schedule')
    await setInputValue(container, '#schedule-cron', 'not a cron')

    await clickButton(container, '[data-testid="submit-schedule"]')

    expect(
      requests.some((request) => request.url.includes('/api/v1/scheduled-tasks'))
    ).toBe(false)
    expect(container.textContent).toContain('Invalid cron expression.')
  }, 15000)

  it('edits a task and sends an exact update payload', async () => {
    const requests = backend.requests
    const container = renderEdit()

    await waitFor(
      () =>
        container.querySelector<HTMLTextAreaElement>('[data-testid="schedule-prompt-input"]')?.value ===
        'Summarize unread inbox and post the digest.'
    )
    expect(container.querySelector<HTMLInputElement>('#schedule-cron')?.value).toBe('0 8 * * *')

    await setInputValue(container, '[data-testid="schedule-prompt-input"]', 'Updated digest instruction')
    await clickButton(container, '[data-testid="submit-schedule"]')

    const updateRequest = requests.find(
      (request) =>
        request.method === 'POST' && request.url.endsWith('/api/v1/scheduled-tasks/st_daily_digest')
    )
    expect(updateRequest).toBeTruthy()
    expect(updateRequest?.body).toEqual({
      prompt: 'Updated digest instruction',
      cronExpression: '0 8 * * *',
      timezone: 'Asia/Kolkata',
      status: 'ENABLED',
    })
  }, 15000)

  it('runs a task now through POST /run', async () => {
    const requests = backend.requests
    const container = renderHub()

    await waitFor(() => container.querySelector('[data-testid="scheduled-task-row"]') !== null)

    await clickButtonWithText(container, 'Run Now')

    await waitFor(
      () =>
        requests.some(
          (request) =>
            request.method === 'POST' &&
            request.url.endsWith('/api/v1/scheduled-tasks/st_daily_digest/run')
        ) === true
    )
  }, 15000)

  it('deletes after confirmation using DELETE', async () => {
    const container = renderHub()

    await waitFor(() => container.querySelector('[data-testid="scheduled-task-row"]') !== null)

    const deleteButton = Array.from(container.querySelectorAll('button')).find((candidate) =>
      candidate.getAttribute('aria-label')?.includes('Delete')
    )
    expect(deleteButton).toBeTruthy()
    await act(async () => {
      deleteButton?.click()
    })

    await waitFor(() => document.querySelector('[role="dialog"]') !== null)
    expect(document.body.textContent).toContain('Delete scheduled task?')
    expect(backend.deletedIds.length).toBe(0)

    await clickButtonWithText(document.body as HTMLElement, 'Delete')

    await waitFor(() => backend.deletedIds.length === 1)
    const deleteRequest = backend.requests.find((request) => request.method === 'DELETE')
    expect(deleteRequest?.url).toContain('/api/v1/scheduled-tasks/st_daily_digest')
  }, 15000)

  it('detail page toggles status through update payloads', async () => {
    const requests = backend.requests
    const container = renderDetail()

    await waitFor(() => container.querySelector('[data-testid="schedule-overview"]') !== null)
    expect(container.textContent).toContain('Asia/Kolkata')

    await clickButtonWithText(container, 'Disable')

    const updateRequest = requests.find(
      (request) =>
        request.method === 'POST' &&
        request.url.endsWith('/api/v1/scheduled-tasks/st_daily_digest') &&
        (request.body as Record<string, unknown>)?.status === 'DISABLED'
    )
    expect(updateRequest).toBeTruthy()

    await waitFor(
      () => container.querySelector('[data-testid="automation-status-disabled"]') !== null
    )
  }, 15000)
})

async function pickTimezone(container: HTMLElement, preferredZones: string[]): Promise<string> {
  const available = Intl.supportedValuesOf('timeZone')
  const zone =
    preferredZones.find((candidate) => available.includes(candidate)) ?? available[0] ?? 'UTC'

  const combobox = container.querySelector<HTMLInputElement>('#schedule-timezone')
  expect(combobox).not.toBeNull()
  await act(async () => {
    combobox?.focus()
  })
  await setInputValue(container, '#schedule-timezone', zone)
  const findOption = (): HTMLButtonElement | undefined =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]')).find((candidate) =>
      candidate.textContent?.trim().startsWith(zone)
    )
  await waitFor(() => findOption() !== undefined)
  const option = findOption()
  await act(async () => {
    option?.click()
  })
  return zone
}

function renderAll(): HTMLElement {
  const queryClient = createTestQueryClient()
  return mount(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/automations/schedules']}>
        <Routes>
          <Route path="/automations/schedules" element={<ScheduledTasksPage />} />
          <Route path="/automations/schedules/new" element={<NewScheduledTaskPage />} />
          <Route path="/automations/schedules/:id" element={<ScheduledTaskDetailPage />} />
          <Route path="/automations/schedules/:id/edit" element={<EditScheduledTaskPage />} />
          <Route path="/activity/:id" element={<div>activity</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderHub(): HTMLElement {
  return renderAll()
}

function renderNew(): HTMLElement {
  const queryClient = createTestQueryClient()
  return mount(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/automations/schedules/new']}>
        <Routes>
          <Route path="/automations/schedules/new" element={<NewScheduledTaskPage />} />
          <Route path="/automations/schedules/:id" element={<div>schedule detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderEdit(): HTMLElement {
  const queryClient = createTestQueryClient()
  return mount(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/automations/schedules/st_daily_digest/edit']}>
        <Routes>
          <Route path="/automations/schedules/:id/edit" element={<EditScheduledTaskPage />} />
          <Route path="/automations/schedules/:id" element={<div>schedule detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderDetail(): HTMLElement {
  const queryClient = createTestQueryClient()
  return mount(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/automations/schedules/st_daily_digest']}>
        <Routes>
          <Route path="/automations/schedules/:id" element={<ScheduledTaskDetailPage />} />
          <Route path="/automations/schedules/:id/edit" element={<div>schedule edit</div>} />
          <Route path="/activity/:id" element={<div>activity</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

