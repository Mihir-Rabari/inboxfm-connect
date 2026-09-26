import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPage from './index'
import { apiClient } from '@/lib/api/client'
import { User } from '@/lib/api/types'
import { AuthProvider } from '@/lib/auth/auth-context'
import { ThemeProvider } from '@/lib/theme/theme-provider'
import { stubApi } from '@/test/api-stub'
import { testProject, testUser } from '@/test/fixtures/api-keys'
import { createTestQueryClient, mount, waitFor } from '@/test/test-utils'

const PROJECT = testProject()

function signIn({ user = testUser() }: { user?: User } = {}): void {
  apiClient.setToken('test-token')
  apiClient.setProjectId(PROJECT.id)
  localStorage.setItem('ap-user', JSON.stringify(user))
}

function renderSettingsPage(): HTMLElement {
  const queryClient = createTestQueryClient()
  return mount(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <MemoryRouter initialEntries={['/settings']}>
            <Routes>
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

const PROJECTS_MATCH = (url: URL, method?: string) => url.pathname === '/api/v1/projects' && method === 'GET'
const BILLING_INFO_MATCH = (url: URL, method?: string) => url.pathname === '/api/v1/platform-billing/info' && method === 'GET'
const BILLING_PORTAL_MATCH = (url: URL, method?: string) => url.pathname === '/api/v1/platform-billing/portal' && method === 'POST'
const BILLING_CHECKOUT_MATCH = (url: URL, method?: string) => url.pathname === '/api/v1/platform-billing/create-checkout-session' && method === 'POST'

describe('Settings page', () => {
  beforeEach(() => {
    localStorage.clear()
    signIn()
    vi.restoreAllMocks()
    vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  it('renders settings page with project information, appearance, and community billing details', async () => {
    stubApi([
      { match: PROJECTS_MATCH, respond: () => ({ body: { data: [PROJECT] } }) },
      {
        match: BILLING_INFO_MATCH,
        respond: () => ({
          body: {
            plan: {
              plan: 'community',
              activeFlowsLimit: null,
              includedAiCredits: 0,
            },
            usage: {
              activeFlows: 2,
            },
          },
        }),
      },
    ])

    const container = renderSettingsPage()

    await waitFor(() => container.textContent?.includes('Settings') === true)
    await waitFor(() => container.textContent?.includes('Subscription & Billing') === true)
    await waitFor(() => container.textContent?.includes('Community Plan') === true)
    await waitFor(() => container.textContent?.includes('Upgrade to Paid Tier') === true)
    await waitFor(() => container.textContent?.includes('Project Information') === true)
    await waitFor(() => container.textContent?.includes('Developer Identity') === true)
  })

  it('renders active subscription badge and manage in stripe button for paid plans', async () => {
    let portalCalled = false
    stubApi([
      { match: PROJECTS_MATCH, respond: () => ({ body: { data: [PROJECT] } }) },
      {
        match: BILLING_INFO_MATCH,
        respond: () => ({
          body: {
            plan: {
              plan: 'standard',
              stripeSubscriptionId: 'sub_12345',
              stripeSubscriptionStatus: 'active',
              activeFlowsLimit: 25,
              includedAiCredits: 500,
            },
            usage: {
              activeFlows: 5,
            },
          },
        }),
      },
      {
        match: BILLING_PORTAL_MATCH,
        respond: () => {
          portalCalled = true
          return { body: { url: 'https://billing.stripe.com/session/test_session' } }
        },
      },
    ])

    const container = renderSettingsPage()

    await waitFor(() => container.textContent?.includes('Active Subscription') === true)
    await waitFor(() => container.textContent?.includes('Manage in Stripe') === true)
    await waitFor(() => container.textContent?.includes('25') === true)

    const manageBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Manage in Stripe')
    )
    expect(manageBtn).toBeDefined()

    await act(async () => {
      manageBtn?.click()
    })

    await waitFor(() => portalCalled === true)
    expect(window.open).toHaveBeenCalledWith('https://billing.stripe.com/session/test_session', '_blank', 'noopener,noreferrer')
  })

  it('renders past due warning banner when payment has failed', async () => {
    stubApi([
      { match: PROJECTS_MATCH, respond: () => ({ body: { data: [PROJECT] } }) },
      {
        match: BILLING_INFO_MATCH,
        respond: () => ({
          body: {
            plan: {
              plan: 'standard',
              stripeSubscriptionId: 'sub_failed',
              stripeSubscriptionStatus: 'past_due',
              activeFlowsLimit: 10,
              includedAiCredits: 200,
            },
            usage: {},
          },
        }),
      },
    ])

    const container = renderSettingsPage()

    await waitFor(() => container.textContent?.includes('Payment Past Due') === true)
    await waitFor(() => container.textContent?.includes('Your recent subscription payment failed') === true)
    await waitFor(() => container.textContent?.includes('Please update your payment method in Stripe') === true)
  })

  it('initiates Stripe checkout when upgrading to paid tier', async () => {
    let checkoutCalled = false
    stubApi([
      { match: PROJECTS_MATCH, respond: () => ({ body: { data: [PROJECT] } }) },
      {
        match: BILLING_INFO_MATCH,
        respond: () => ({
          body: {
            plan: {
              plan: 'community',
            },
            usage: {},
          },
        }),
      },
      {
        match: BILLING_CHECKOUT_MATCH,
        respond: () => {
          checkoutCalled = true
          return {
            body: {
              stripeCheckoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_123',
              url: 'https://checkout.stripe.com/c/pay/cs_test_123',
            },
          }
        },
      },
    ])

    const container = renderSettingsPage()

    await waitFor(() => container.textContent?.includes('Upgrade to Paid Tier') === true)

    const upgradeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Upgrade to Paid Tier')
    )
    expect(upgradeBtn).toBeDefined()

    await act(async () => {
      upgradeBtn?.click()
    })

    await waitFor(() => checkoutCalled === true)
    expect(window.open).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_123', '_blank', 'noopener,noreferrer')
  })
})
