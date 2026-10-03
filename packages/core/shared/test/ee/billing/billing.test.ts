import { describe, expect, it } from 'vitest'
import {
    AiCreditsAutoTopUpState,
    PlanName,
    TeamProjectsLimit,
} from '../../../src/lib/management/platform'
import {
    APPSUMO_PLAN,
    ApSubscriptionStatus,
    CreateAICreditCheckoutSessionParamsSchema,
    CreateCheckoutSessionParamsSchema,
    isCloudPlanButNotEnterprise,
    OPEN_SOURCE_PLAN,
    PRICE_ID_MAP,
    PRICE_NAMES,
    PRICE_PER_EXTRA_ACTIVE_FLOWS,
    STANDARD_CLOUD_PLAN,
    UpdateAICreditsAutoTopUpParamsSchema,
    UpdateActiveFlowsAddonParamsSchema,
} from '../../../src/lib/ee/billing'

describe('Billing Domain Contracts and Schemas', () => {
    describe('Subscription Status and Pricing Constants', () => {
        it('defines expected ApSubscriptionStatus enum values', () => {
            expect(ApSubscriptionStatus.ACTIVE).toBe('active')
            expect(ApSubscriptionStatus.CANCELED).toBe('canceled')
            expect(ApSubscriptionStatus.PAST_DUE).toBe('past_due')
            expect(ApSubscriptionStatus.UNPAID).toBe('unpaid')
            expect(ApSubscriptionStatus.INCOMPLETE).toBe('incomplete')
            expect(ApSubscriptionStatus.INCOMPLETE_EXPIRED).toBe('incomplete_expired')
            expect(ApSubscriptionStatus.TRIALING).toBe('trialing')
            expect(ApSubscriptionStatus.PAUSED).toBe('paused')
        })

        it('defines expected PRICE_PER_EXTRA_ACTIVE_FLOWS constant', () => {
            expect(PRICE_PER_EXTRA_ACTIVE_FLOWS).toBe(5)
        })

        it('maps Stripe Price IDs for dev and prod environments', () => {
            expect(PRICE_NAMES.AI_CREDITS).toBe('ai-credit')
            expect(PRICE_NAMES.ACTIVE_FLOWS).toBe('active-flow')

            expect(PRICE_ID_MAP[PRICE_NAMES.AI_CREDITS].dev).toBe('price_1SfgNxKTWXpWeD7hmDBG4YMZ')
            expect(PRICE_ID_MAP[PRICE_NAMES.AI_CREDITS].prod).toBe('price_1Rnj5bKZ0dZRqLEKQx2gwL7s')
            expect(PRICE_ID_MAP[PRICE_NAMES.ACTIVE_FLOWS].dev).toBe('price_1SQbbYQN93Aoq4f8WK2JC4sf')
            expect(PRICE_ID_MAP[PRICE_NAMES.ACTIVE_FLOWS].prod).toBe('price_1SQbcvKZ0dZRqLEKHV5UepRx')
        })
    })

    describe('Flow Limit and Checkout Session DTOs', () => {
        it('validates UpdateActiveFlowsAddonParamsSchema within bounds', () => {
            expect(
                UpdateActiveFlowsAddonParamsSchema.parse({ newActiveFlowsLimit: 1 }),
            ).toEqual({ newActiveFlowsLimit: 1 })
            expect(
                UpdateActiveFlowsAddonParamsSchema.parse({ newActiveFlowsLimit: 50 }),
            ).toEqual({ newActiveFlowsLimit: 50 })
            expect(
                UpdateActiveFlowsAddonParamsSchema.parse({ newActiveFlowsLimit: 10000 }),
            ).toEqual({ newActiveFlowsLimit: 10000 })
        })

        it('rejects active flow limits outside 1 to 10,000 bounds', () => {
            expect(() =>
                UpdateActiveFlowsAddonParamsSchema.parse({ newActiveFlowsLimit: 0 }),
            ).toThrow()
            expect(() =>
                UpdateActiveFlowsAddonParamsSchema.parse({ newActiveFlowsLimit: -5 }),
            ).toThrow()
            expect(() =>
                UpdateActiveFlowsAddonParamsSchema.parse({ newActiveFlowsLimit: 10001 }),
            ).toThrow()
        })

        it('validates CreateCheckoutSessionParamsSchema', () => {
            expect(
                CreateCheckoutSessionParamsSchema.parse({ newActiveFlowsLimit: 15 }),
            ).toEqual({ newActiveFlowsLimit: 15 })
        })

        it('validates CreateAICreditCheckoutSessionParamsSchema', () => {
            expect(
                CreateAICreditCheckoutSessionParamsSchema.parse({ aiCredits: 1000 }),
            ).toEqual({ aiCredits: 1000 })
        })
    })

    describe('AI Credits Auto Top-Up Schema', () => {
        it('validates ENABLED auto top-up config with numeric thresholds', () => {
            const enabledConfig = {
                state: AiCreditsAutoTopUpState.ENABLED as const,
                minThreshold: 50,
                creditsToAdd: 500,
                maxMonthlyLimit: 2000,
            }
            const parsed = UpdateAICreditsAutoTopUpParamsSchema.parse(enabledConfig)
            expect(parsed.state).toBe(AiCreditsAutoTopUpState.ENABLED)
        })

        it('validates ENABLED auto top-up config with null maxMonthlyLimit', () => {
            const parsed = UpdateAICreditsAutoTopUpParamsSchema.parse({
                state: AiCreditsAutoTopUpState.ENABLED as const,
                minThreshold: 20,
                creditsToAdd: 200,
                maxMonthlyLimit: null,
            })
            expect(parsed.state).toBe(AiCreditsAutoTopUpState.ENABLED)
        })

        it('validates DISABLED auto top-up config', () => {
            const parsed = UpdateAICreditsAutoTopUpParamsSchema.parse({
                state: AiCreditsAutoTopUpState.DISABLED as const,
            })
            expect(parsed.state).toBe(AiCreditsAutoTopUpState.DISABLED)
        })
    })

    describe('Predefined Platform Plans and Helper functions', () => {
        it('configures STANDARD_CLOUD_PLAN defaults', () => {
            expect(STANDARD_CLOUD_PLAN.plan).toBe('standard')
            expect(STANDARD_CLOUD_PLAN.tablesEnabled).toBe(true)
            expect(STANDARD_CLOUD_PLAN.includedAiCredits).toBe(200)
            expect(STANDARD_CLOUD_PLAN.activeFlowsLimit).toBe(10)
            expect(STANDARD_CLOUD_PLAN.teamProjectsLimit).toBe(TeamProjectsLimit.ONE)
        })

        it('configures OPEN_SOURCE_PLAN defaults', () => {
            expect(OPEN_SOURCE_PLAN.tablesEnabled).toBe(true)
            expect(OPEN_SOURCE_PLAN.includedAiCredits).toBe(0)
            expect(OPEN_SOURCE_PLAN.aiProvidersEnabled).toBe(true)
        })

        it('generates APPSUMO_PLAN preserving standard plan features without flow limits', () => {
            const appsumo = APPSUMO_PLAN(PlanName.APPSUMO_ACTIVEPIECES_TIER1)
            expect(appsumo.plan).toBe(PlanName.APPSUMO_ACTIVEPIECES_TIER1)
            expect(appsumo.plan).toBe('appsumo_activepieces_tier1')
            expect(appsumo.activeFlowsLimit).toBeUndefined()
            expect(appsumo.tablesEnabled).toBe(true)
        })

        it('evaluates isCloudPlanButNotEnterprise correctly', () => {
            expect(isCloudPlanButNotEnterprise(PlanName.STANDARD)).toBe(true)
            expect(isCloudPlanButNotEnterprise(PlanName.ENTERPRISE)).toBe(false)
            expect(isCloudPlanButNotEnterprise('custom')).toBe(false)
            expect(isCloudPlanButNotEnterprise(null)).toBe(false)
            expect(isCloudPlanButNotEnterprise(undefined)).toBe(false)
        })
    })
})
