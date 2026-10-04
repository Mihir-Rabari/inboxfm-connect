import { apId, formErrors } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import {
    ConnectApiKey,
    ConnectApiKeyResponseWithoutValue,
    ConnectApiKeyResponseWithValue,
    CreateConnectApiKeyRequest,
} from '../../src/lib/connect-api-key'

describe('ConnectApiKey schemas', () => {
    const validKey = {
        id: apId(),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        platformId: apId(),
        projectId: apId(),
        displayName: 'Production Backend Connect Key',
        hashedValue: 'hash_secret_key_123',
        truncatedValue: 'ak_live_...99',
        lastUsedAt: null,
        expiresAt: null,
    }

    describe('ConnectApiKey model schema', () => {
        it('validates a complete connect API key with null expiry and lastUsedAt', () => {
            const parsed = ConnectApiKey.parse(validKey)
            expect(parsed.id).toBe(validKey.id)
            expect(parsed.displayName).toBe('Production Backend Connect Key')
            expect(parsed.lastUsedAt).toBeNull()
            expect(parsed.expiresAt).toBeNull()
        })

        it('validates connect API key with populated timestamps', () => {
            const nowIso = new Date().toISOString()
            const parsed = ConnectApiKey.parse({
                ...validKey,
                lastUsedAt: nowIso,
                expiresAt: nowIso,
            })
            expect(parsed.lastUsedAt).toBe(nowIso)
            expect(parsed.expiresAt).toBe(nowIso)
        })

        it('rejects API key missing required displayName', () => {
            const invalid = { ...validKey }
            delete (invalid as Record<string, unknown>).displayName
            expect(() => ConnectApiKey.parse(invalid)).toThrow()
        })
    })

    describe('ConnectApiKeyResponseWithValue schema', () => {
        it('requires value and omits hashedValue', () => {
            const parsed = ConnectApiKeyResponseWithValue.parse({
                ...validKey,
                value: 'ak_live_full_plaintext_secret_token_12345',
            })
            expect(parsed.value).toBe('ak_live_full_plaintext_secret_token_12345')
            expect('hashedValue' in parsed).toBe(false)
        })

        it('rejects when plaintext value is missing', () => {
            expect(() => ConnectApiKeyResponseWithValue.parse(validKey)).toThrow()
        })
    })

    describe('ConnectApiKeyResponseWithoutValue schema', () => {
        it('validates API key metadata without plaintext value or hashedValue', () => {
            const parsed = ConnectApiKeyResponseWithoutValue.parse(validKey)
            expect('hashedValue' in parsed).toBe(false)
            expect('value' in parsed).toBe(false)
            expect(parsed.displayName).toBe(validKey.displayName)
        })
    })

    describe('CreateConnectApiKeyRequest schema', () => {
        it('accepts valid request with future ISO expiry', () => {
            const futureIso = new Date(Date.now() + 86400000 * 30).toISOString()
            const parsed = CreateConnectApiKeyRequest.parse({
                displayName: 'Dev Agent Key',
                projectId: apId(),
                expiresAt: futureIso,
            })
            expect(parsed.displayName).toBe('Dev Agent Key')
            expect(parsed.expiresAt).toBe(futureIso)
        })

        it('accepts valid request without expiresAt (permanent key)', () => {
            const parsed = CreateConnectApiKeyRequest.parse({
                displayName: 'Permanent CLI Key',
                projectId: apId(),
            })
            expect(parsed.expiresAt).toBeUndefined()
        })

        it('rejects past expiresAt with apiKeyExpiryMustBeFuture error message', () => {
            const pastIso = new Date(Date.now() - 3600000).toISOString()
            expect(() =>
                CreateConnectApiKeyRequest.parse({
                    displayName: 'Expired Key',
                    projectId: apId(),
                    expiresAt: pastIso,
                }),
            ).toThrowError(formErrors.apiKeyExpiryMustBeFuture)
        })

        it('rejects invalid non-apId projectId', () => {
            expect(() =>
                CreateConnectApiKeyRequest.parse({
                    displayName: 'Key',
                    projectId: 'not_an_apid!',
                }),
            ).toThrow()
        })
    })
})
