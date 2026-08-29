import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executionsApi } from './executions'
import { apiClient } from './client'
import { stubApi } from '@/test/api-stub'
import { EXECUTIONS_PROJECT_ID, recordedExecution, executionsPage } from '@/test/fixtures/executions'

describe('executionsApi', () => {
  beforeEach(() => {
    localStorage.clear()
    apiClient.setProjectId(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends projectId, status and limit as explicit query parameters', async () => {
    const { calls } = stubApi([
      { match: (url) => url.pathname === '/api/v1/executions', respond: () => ({ status: 200, body: executionsPage([recordedExecution]) }) },
    ])

    await executionsApi.list({ projectId: EXECUTIONS_PROJECT_ID, status: 'FAILED', limit: 25 })

    expect(calls).toHaveLength(1)
    const url = new URL(calls[0])
    expect(url.pathname).toBe('/api/v1/executions')
    expect(url.searchParams.get('projectId')).toBe(EXECUTIONS_PROJECT_ID)
    expect(url.searchParams.get('status')).toBe('FAILED')
    expect(url.searchParams.get('limit')).toBe('25')
  })

  it('omits the status parameter when not provided', async () => {
    const { calls } = stubApi([
      { match: (url) => url.pathname === '/api/v1/executions', respond: () => ({ status: 200, body: executionsPage([]) }) },
    ])

    await executionsApi.list({ projectId: EXECUTIONS_PROJECT_ID })

    const url = new URL(calls[0])
    expect(url.searchParams.has('status')).toBe(false)
    expect(url.searchParams.has('limit')).toBe(false)
  })

  it('falls back to the stored project id when none is passed', async () => {
    apiClient.setProjectId(EXECUTIONS_PROJECT_ID)
    const { calls } = stubApi([
      { match: (url) => url.pathname === '/api/v1/executions', respond: () => ({ status: 200, body: executionsPage([]) }) },
    ])

    await executionsApi.list()

    const url = new URL(calls[0])
    expect(url.searchParams.get('projectId')).toBe(EXECUTIONS_PROJECT_ID)
  })

  it('prefers the explicit projectId over the stored one', async () => {
    apiClient.setProjectId('proj_stale')
    const { calls } = stubApi([
      { match: (url) => url.pathname === '/api/v1/executions', respond: () => ({ status: 200, body: executionsPage([]) }) },
    ])

    await executionsApi.list({ projectId: EXECUTIONS_PROJECT_ID })

    const url = new URL(calls[0])
    expect(url.searchParams.get('projectId')).toBe(EXECUTIONS_PROJECT_ID)
  })
})
