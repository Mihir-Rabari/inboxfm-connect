import { AzureProviderConfig, CloudflareGatewayProviderConfig, formErrors } from '@inboxfm-connect/shared'
import { describe, expect, it } from 'vitest'

describe('AI provider config host-safety validation', () => {
    describe('AzureProviderConfig.resourceName', () => {
        it('accepts a hostname-safe resource name', async () => {
            const result = await AzureProviderConfig.safeParseAsync({ resourceName: 'my-resource-123' })
            expect(result.success).toBe(true)
        })

        it.each([
            'evil#attacker.com',
            'a/b',
            'with space',
            '-leading-hyphen',
            'trailing-hyphen-',
            '',
        ])('rejects host-unsafe resource name %p', async (resourceName) => {
            const result = await AzureProviderConfig.safeParseAsync({ resourceName })
            expect(result.success).toBe(false)
            if (!result.success) {
                expect(result.error.issues[0].message).toBe(formErrors.invalidAzureResourceName)
            }
        })
    })

    describe('CloudflareGatewayProviderConfig identifiers', () => {
        it('accepts path-safe identifiers', async () => {
            const result = await CloudflareGatewayProviderConfig.safeParseAsync({
                accountId: 'abc123DEF456',
                gatewayId: 'my-gateway_01',
                models: [],
            })
            expect(result.success).toBe(true)
        })

        it.each([
            ['evil/segment', 'gateway'],
            ['account', 'evil#fragment'],
            ['account', 'has space'],
            ['', 'gateway'],
        ])('rejects path-unsafe identifiers %p', async (accountId, gatewayId) => {
            const result = await CloudflareGatewayProviderConfig.safeParseAsync({
                accountId,
                gatewayId,
                models: [],
            })
            expect(result.success).toBe(false)
        })
    })
})
