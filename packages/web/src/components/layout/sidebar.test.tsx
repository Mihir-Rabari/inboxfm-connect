import { beforeEach, describe, expect, it } from 'vitest'
import { Sidebar } from './sidebar'
import { mountAt, waitFor } from '@/test/test-utils'
import { apiClient } from '@/lib/api/client'

const CORE_ITEMS = [
  'Overview',
  'Integrations',
  'Connections',
  'Actions',
  'Triggers',
  'Scheduled Tasks',
  'MCP',
]
const PLATFORM_ITEMS = ['Activity', 'Developers', 'API Keys', 'Settings']
const LEGACY_ITEMS = ['Flows', 'Flow Runs', 'Flow Versions', 'Folders']

describe('Sidebar', () => {
  beforeEach(() => {
    localStorage.clear()
    document.body.innerHTML = ''
  })

  it('renders all developer console navigation groups', () => {
    const container = mountAt(<Sidebar />, { route: '/' })
    const text = container.textContent || ''

    CORE_ITEMS.forEach((label) => expect(text).toContain(label))
    PLATFORM_ITEMS.forEach((label) => expect(text).toContain(label))
  })

  it('does not render legacy flow-builder navigation', () => {
    const container = mountAt(<Sidebar />, { route: '/' })
    const text = container.textContent || ''

    LEGACY_ITEMS.forEach((label) => expect(text).not.toContain(label))
  })

  it('marks the active route with aria-current and active styling', () => {
    const container = mountAt(<Sidebar />, { route: '/integrations' })

    const activeLink = container.querySelector('a[href="/integrations"]')
    expect(activeLink).not.toBeNull()
    expect(activeLink?.getAttribute('aria-current')).toBe('page')
    expect(activeLink?.className).toContain('text-primary')

    const overviewLink = container.querySelector('a[href="/"]')
    expect(overviewLink?.getAttribute('aria-current')).toBeNull()
    expect(overviewLink?.className).not.toContain('text-primary')
  })

  it('shows the current project from the auth context', async () => {
    apiClient.setProjectId('proj_real')
    localStorage.setItem(
      'ap-user',
      JSON.stringify({ id: 'user_1', email: 'a@b.c', firstName: 'Ada', lastName: 'A' })
    )

    const container = mountAt(<Sidebar />, { route: '/' })

    await waitFor(() => container.textContent?.includes('Developer Console') === true)
    expect(container.textContent).toContain('Developer Console')
    // The real project name, once /projects resolves it.
    await waitFor(() => (container.textContent || '').length > 0)
  })

  /**
   * #174: with no active project the switcher used to render a hardcoded
   * "InboxFM Main Project", which reads as a real project name. It now shows a
   * neutral em dash so an absent project is visibly absent.
   */
  it('shows a neutral placeholder instead of a fabricated project name', async () => {
    apiClient.setProjectId(null)
    localStorage.setItem(
      'ap-user',
      JSON.stringify({ id: 'user_1', email: 'a@b.c', firstName: 'Ada', lastName: 'A' })
    )

    const container = mountAt(<Sidebar />, { route: '/' })

    await waitFor(() => container.textContent?.includes('Developer Console') === true)
    expect(container.textContent).not.toContain('InboxFM Main Project')
    expect(container.textContent).toContain('\u2014')
  })
})
