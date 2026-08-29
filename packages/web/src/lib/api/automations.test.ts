import { beforeEach, describe, expect, it } from 'vitest'
import { automationsApi } from './automations'
import { apiClient } from './client'
import { stubApi } from '@/test/api-stub'
import { seekPage } from '@/test/fixtures/integrations'

const PROJECT_ID = 'proj_automations_test'

function anyRoute(body: unknown) {
  return { match: () => true, respond: () => ({ status: 200, body }) }
}

describe('automationsApi', () => {
  beforeEach(() => {
    localStorage.clear()
    apiClient.setProjectId(null)
  })

  it('scopes the trigger binding list with projectId', async () => {
    apiClient.setProjectId(PROJECT_ID)
    const { calls } = stubApi([anyRoute(seekPage([]))])

    await automationsApi.listTriggerBindings()

    const url = new URL(calls[0])
    expect(url.pathname).toBe('/api/v1/trigger-bindings')
    expect(url.searchParams.get('projectId')).toBe(PROJECT_ID)
  })

  it('scopes the scheduled task list with projectId', async () => {
    apiClient.setProjectId(PROJECT_ID)
    const { calls } = stubApi([anyRoute(seekPage([]))])

    await automationsApi.listScheduledTasks()

    expect(new URL(calls[0]).searchParams.get('projectId')).toBe(PROJECT_ID)
  })

  it('sends projectId in the trigger binding create body', async () => {
    apiClient.setProjectId(PROJECT_ID)
    const { requests } = stubApi([anyRoute({ id: 'tb_1' })])

    await automationsApi.createTriggerBinding({
      pieceName: 'github',
      pieceVersion: '0.1.0',
      triggerName: 'new_issue',
      connectionId: null,
      promptTemplate: 'Handle {{title}}',
      settings: {},
    })

    expect(requests[0].method).toBe('POST')
    expect(requests[0].body).toMatchObject({ projectId: PROJECT_ID, triggerName: 'new_issue' })
  })

  it('sends projectId in the scheduled task create body', async () => {
    apiClient.setProjectId(PROJECT_ID)
    const { requests } = stubApi([anyRoute({ id: 'st_1' })])

    await automationsApi.createScheduledTask({
      prompt: 'Daily summary',
      cronExpression: '0 8 * * *',
      timezone: 'UTC',
    })

    expect(requests[0].body).toMatchObject({ projectId: PROJECT_ID, cronExpression: '0 8 * * *' })
  })

  it('keeps an explicitly provided projectId', async () => {
    apiClient.setProjectId('proj_stale')
    const { requests } = stubApi([anyRoute({ id: 'st_2' })])

    await automationsApi.createScheduledTask({
      projectId: PROJECT_ID,
      prompt: 'Daily summary',
      cronExpression: '0 8 * * *',
      timezone: 'UTC',
    })

    expect(requests[0].body).toMatchObject({ projectId: PROJECT_ID })
  })

  it('omits projectId entirely when no project is active', async () => {
    const { calls, requests } = stubApi([anyRoute(seekPage([]))])

    await automationsApi.listTriggerBindings()
    await automationsApi.createTriggerBinding({
      pieceName: 'github',
      pieceVersion: '0.1.0',
      triggerName: 'new_issue',
      connectionId: null,
      promptTemplate: 'Handle {{title}}',
      settings: {},
    })

    expect(new URL(calls[0]).searchParams.has('projectId')).toBe(false)
    expect(requests[1].body).not.toHaveProperty('projectId')
  })
})
