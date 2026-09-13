import { beforeEach, describe, expect, it } from 'vitest'
import { Sidebar } from './sidebar'
import { mountAt } from '@/test/test-utils'

const CORE_ITEMS = [
  'Overview',
  'Integrations',
  'Connections',
  'Actions',
  'Triggers',
  'Scheduled Tasks',
  'MCP',
]
const PLATFORM_ITEMS = ['Activity', 'Developers', 'Settings']
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

  it('shows the current project from the auth context', () => {
    const container = mountAt(<Sidebar />, { route: '/' })

    expect(container.textContent).toContain('InboxFM Main Project')
    expect(container.textContent).toContain('Developer Console')
  })
})
