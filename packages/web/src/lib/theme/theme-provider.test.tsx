import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeProvider, useTheme } from './theme-provider'
import { mount } from '@/test/test-utils'

const STORAGE_KEY = 'ap-theme-test'

function ThemeProbe() {
  const { theme, setTheme } = useTheme()
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button data-testid="set-dark" onClick={() => setTheme('dark')} />
      <button data-testid="set-light" onClick={() => setTheme('light')} />
    </div>
  )
}

function renderThemeProvider() {
  return mount(
    <ThemeProvider storageKey={STORAGE_KEY} defaultTheme="light">
      <ThemeProbe />
    </ThemeProvider>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark', 'light')
  })

  it('applies the dark class to the document root and persists preference', () => {
    const container = renderThemeProvider()

    const darkButton = container.querySelector('[data-testid="set-dark"]')
    expect(darkButton).not.toBeNull()

    act(() => {
      darkButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="current-theme"]')?.textContent).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes the dark class when switching to light', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    const container = renderThemeProvider()

    expect(document.documentElement.classList.contains('dark')).toBe(true)

    const lightButton = container.querySelector('[data-testid="set-light"]')
    act(() => {
      lightButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(localStorage.getItem(STORAGE_KEY)).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('restores persisted theme on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    const container = renderThemeProvider()

    expect(container.querySelector('[data-testid="current-theme"]')?.textContent).toBe('dark')
  })
})
