import { act, Component } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './error-boundary'
import { mount } from '@/test/test-utils'

class Bomb extends Component<{ shouldThrow: boolean }> {
  render() {
    if (this.props.shouldThrow) {
      throw new Error('kaboom')
    }
    return <div data-testid="safe-content">safe content</div>
  }
}

describe('ErrorBoundary', () => {
  it('renders default error state when a child throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = mount(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(container.textContent).toContain('Application Error')
    expect(container.textContent).toContain('kaboom')
  })

  it('renders the provided fallback instead of children', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const container = mount(
      <ErrorBoundary fallback={<div>custom fallback ui</div>}>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(container.textContent).toContain('custom fallback ui')
    expect(container.textContent).not.toContain('Application Error')
  })

  it('recovers children after retry is clicked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const throwRef = { current: true }
    const BombHost = () => <Bomb shouldThrow={throwRef.current} />
    const container = mount(
      <ErrorBoundary>
        <BombHost />
      </ErrorBoundary>
    )

    expect(container.textContent).toContain('Application Error')

    throwRef.current = false
    const retryButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.toLowerCase().includes('try again')
    )
    expect(retryButton).toBeDefined()

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.querySelector('[data-testid="safe-content"]')?.textContent).toBe(
      'safe content'
    )
  })
})
