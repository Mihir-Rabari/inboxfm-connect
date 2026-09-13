import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { CommandPalette } from './command-palette'
import { mount, waitFor } from '@/test/test-utils'

function LocationProbe() {
  const location = useLocation()
  return <span data-testid="pathname">{location.pathname}</span>
}

function renderPalette(open: boolean, onOpenChange: (open: boolean) => void): HTMLElement {
  return mount(
    <MemoryRouter initialEntries={['/']}>
      <CommandPalette open={open} onOpenChange={onOpenChange} />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CommandPalette', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('toggles open state on Ctrl+K / Cmd+K keydown', () => {
    const onOpenChange = vi.fn()
    renderPalette(false, onOpenChange)

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })
      )
    })
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
      )
    })

    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(onOpenChange).toHaveBeenCalledTimes(2)
  })

  it('renders navigation destinations when open', async () => {
    renderPalette(true, vi.fn())

    await waitFor(() => document.querySelector('[cmdk-root]') !== null)

    const labels = ['Overview Dashboard', 'Integrations Catalog', 'Connections & Credentials']
    labels.forEach((label) => {
      expect(document.body.textContent).toContain(label)
    })
  })

  it('navigates to the target route and closes on selection', async () => {
    const onOpenChange = vi.fn()
    renderPalette(true, onOpenChange)

    await waitFor(() => document.querySelectorAll('[cmdk-item]').length > 0)

    const items = Array.from(document.querySelectorAll<HTMLElement>('[cmdk-item]'))
    const connectionsItem = items.find((item) =>
      item.textContent?.includes('Connections & Credentials')
    )
    expect(connectionsItem).toBeDefined()

    await act(async () => {
      connectionsItem?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(document.querySelector('[data-testid="pathname"]')?.textContent).toBe('/connections')
  })
})
