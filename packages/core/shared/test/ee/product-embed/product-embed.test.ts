import { describe, expect, it } from 'vitest'
import {
    AppCredentialType,
    ListAppCredentialsRequest,
    UpsertApiKeyCredentialRequest,
    UpsertAppCredentialRequest,
    UpsertOAuth2CredentialRequest,
} from '../../../src/lib/ee/product-embed/app-credentials'
import {
    ConnectionKeyType,
    GetOrDeleteConnectionFromTokenRequest,
    ListConnectionKeysRequest,
    UpsertApiKeyConnectionFromToken,
    UpsertConnectionFromToken,
    UpsertOAuth2ConnectionFromToken,
    UpsertSigningKeyConnection,
} from '../../../src/lib/ee/product-embed/connection-keys'

describe('Product Embed Contracts (#141)', () => {
    describe('App Credentials', () => {
        it('defines valid AppCredentialType enum values', () => {
            expect(AppCredentialType.API_KEY).toBe('API_KEY')
            expect(AppCredentialType.OAUTH2).toBe('OAUTH2')
        })

        describe('ListAppCredentialsRequest schema', () => {
            it('parses valid request with optional filters and coercion', () => {
                const parsed = ListAppCredentialsRequest.parse({
                    projectId: 'proj-123',
                    appName: '@inboxfm-connect/piece-slack',
                    limit: '25',
                    cursor: 'cursor-xyz',
                })
                expect(parsed.projectId).toBe('proj-123')
                expect(parsed.appName).toBe('@inboxfm-connect/piece-slack')
                expect(parsed.limit).toBe(25)
                expect(parsed.cursor).toBe('cursor-xyz')
            })

            it('rejects missing projectId', () => {
                const result = ListAppCredentialsRequest.safeParse({ limit: 10 })
                expect(result.success).toBe(false)
            })
        })

        describe('UpsertApiKeyCredentialRequest schema', () => {
            it('parses valid API Key credential request', () => {
                const parsed = UpsertApiKeyCredentialRequest.parse({
                    id: 'cred-123',
                    appName: 'custom-crm',
                    projectId: 'proj-456',
                    settings: {
                        type: AppCredentialType.API_KEY,
                    },
                })
                expect(parsed.id).toBe('cred-123')
                expect(parsed.settings.type).toBe('API_KEY')
            })

            it('rejects invalid settings type for API Key request', () => {
                const result = UpsertApiKeyCredentialRequest.safeParse({
                    appName: 'custom-crm',
                    projectId: 'proj-456',
                    settings: {
                        type: AppCredentialType.OAUTH2,
                    },
                })
                expect(result.success).toBe(false)
            })
        })

        describe('UpsertOAuth2CredentialRequest schema', () => {
            it('parses valid OAuth2 credential request', () => {
                const parsed = UpsertOAuth2CredentialRequest.parse({
                    appName: 'google-sheets',
                    projectId: 'proj-789',
                    settings: {
                        type: AppCredentialType.OAUTH2,
                        authUrl: 'https://accounts.google.com/o/oauth2/auth',
                        tokenUrl: 'https://oauth2.googleapis.com/token',
                        clientId: 'google-client-id',
                        clientSecret: 'google-client-secret',
                        scope: 'https://www.googleapis.com/auth/spreadsheets',
                    },
                })
                expect(parsed.settings.clientId).toBe('google-client-id')
                expect(parsed.settings.type).toBe('OAUTH2')
            })

            it('rejects OAuth2 request missing tokenUrl or clientSecret', () => {
                const result = UpsertOAuth2CredentialRequest.safeParse({
                    appName: 'google-sheets',
                    projectId: 'proj-789',
                    settings: {
                        type: AppCredentialType.OAUTH2,
                        authUrl: 'https://accounts.google.com/o/oauth2/auth',
                        clientId: 'google-client-id',
                        scope: 'spreadsheets',
                    },
                })
                expect(result.success).toBe(false)
            })
        })

        describe('UpsertAppCredentialRequest union', () => {
            it('discriminates API_KEY payload', () => {
                const parsed = UpsertAppCredentialRequest.parse({
                    appName: 'stripe',
                    projectId: 'proj-1',
                    settings: { type: AppCredentialType.API_KEY },
                })
                expect(parsed.settings.type).toBe(AppCredentialType.API_KEY)
            })

            it('discriminates OAUTH2 payload', () => {
                const parsed = UpsertAppCredentialRequest.parse({
                    appName: 'github',
                    projectId: 'proj-2',
                    settings: {
                        type: AppCredentialType.OAUTH2,
                        authUrl: 'https://github.com/login/oauth/authorize',
                        tokenUrl: 'https://github.com/login/oauth/access_token',
                        clientId: 'gh-id',
                        clientSecret: 'gh-sec',
                        scope: 'repo',
                    },
                })
                expect(parsed.settings.type).toBe(AppCredentialType.OAUTH2)
            })
        })
    })

    describe('Connection Keys', () => {
        it('defines valid ConnectionKeyType enum values', () => {
            expect(ConnectionKeyType.SIGNING_KEY).toBe('SIGNING_KEY')
        })

        describe('ListConnectionKeysRequest schema', () => {
            it('parses valid list request with coercion', () => {
                const parsed = ListConnectionKeysRequest.parse({
                    projectId: 'proj-conn-1',
                    limit: '50',
                    cursor: 'cur-123',
                })
                expect(parsed.projectId).toBe('proj-conn-1')
                expect(parsed.limit).toBe(50)
            })
        })

        describe('GetOrDeleteConnectionFromTokenRequest schema', () => {
            it('parses valid token lookup/delete request', () => {
                const parsed = GetOrDeleteConnectionFromTokenRequest.parse({
                    projectId: 'proj-1',
                    token: 'embed-jwt-token',
                    appName: 'notion',
                })
                expect(parsed.token).toBe('embed-jwt-token')
                expect(parsed.appName).toBe('notion')
            })
        })

        describe('UpsertConnectionFromToken schemas', () => {
            it('parses API Key connection payload', () => {
                const parsed = UpsertApiKeyConnectionFromToken.parse({
                    appCredentialId: 'cred-1',
                    apiKey: 'sk_live_123456789',
                    token: 'jwt-auth-token',
                })
                expect(parsed.apiKey).toBe('sk_live_123456789')
            })

            it('parses OAuth2 connection payload', () => {
                const parsed = UpsertOAuth2ConnectionFromToken.parse({
                    appCredentialId: 'cred-2',
                    props: { accountId: 'acc-123' },
                    token: 'jwt-auth-token',
                    code: 'oauth-code-xyz',
                    redirectUrl: 'https://cloud.activepieces.com/redirect',
                })
                expect(parsed.code).toBe('oauth-code-xyz')
                expect(parsed.props).toEqual({ accountId: 'acc-123' })
            })

            it('validates UpsertConnectionFromToken union correctly', () => {
                const apiKeyParsed = UpsertConnectionFromToken.parse({
                    appCredentialId: 'cred-1',
                    apiKey: 'secret-key',
                    token: 'token-val',
                })
                expect('apiKey' in apiKeyParsed).toBe(true)

                const oauthParsed = UpsertConnectionFromToken.parse({
                    appCredentialId: 'cred-2',
                    props: {},
                    token: 'token-val',
                    code: 'code-val',
                    redirectUrl: 'https://example.com/oauth',
                })
                expect('code' in oauthParsed).toBe(true)
            })
        })

        describe('UpsertSigningKeyConnection schema', () => {
            it('parses valid signing key connection', () => {
                const parsed = UpsertSigningKeyConnection.parse({
                    projectId: 'proj-sk-1',
                    settings: {
                        type: ConnectionKeyType.SIGNING_KEY,
                    },
                })
                expect(parsed.projectId).toBe('proj-sk-1')
                expect(parsed.settings.type).toBe(ConnectionKeyType.SIGNING_KEY)
            })

            it('rejects missing or wrong settings type', () => {
                const result = UpsertSigningKeyConnection.safeParse({
                    projectId: 'proj-sk-1',
                    settings: {
                        type: 'WRONG_TYPE',
                    },
                })
                expect(result.success).toBe(false)
            })
        })
    })
})
