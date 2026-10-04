import { apId, formErrors } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import {
    AWSProviderConfigSchema,
    ConnectSecretManagerRequestSchema,
    CyberarkConjurProviderConfigSchema,
    DisconnectSecretManagerRequestSchema,
    HashicorpProviderConfigSchema,
    OnePasswordProviderConfigSchema,
    SecretManagerConnectionScope,
    SecretManagerProviderId,
} from '../../../src/lib/ee/secret-managers/dto'

describe('Secret Managers Contracts and Schemas', () => {
    describe('SecretManagerProviderId and SecretManagerConnectionScope Enums', () => {
        it('defines expected SecretManagerProviderId values', () => {
            expect(SecretManagerProviderId.HASHICORP).toBe('hashicorp')
            expect(SecretManagerProviderId.AWS).toBe('aws')
            expect(SecretManagerProviderId.CYBERARK).toBe('cyberark-conjur')
            expect(SecretManagerProviderId.ONEPASSWORD).toBe('onepassword')
        })

        it('defines expected SecretManagerConnectionScope values', () => {
            expect(SecretManagerConnectionScope.PLATFORM).toBe('PLATFORM')
            expect(SecretManagerConnectionScope.PROJECT).toBe('PROJECT')
        })
    })

    describe('Provider Config Schemas', () => {
        it('validates HashicorpProviderConfigSchema with and without namespace', () => {
            const valid = {
                url: 'https://vault.example.com:8200',
                namespace: 'admin/tenant1',
                roleId: 'role_123',
                secretId: 'sec_456',
            }
            const parsed = HashicorpProviderConfigSchema.parse(valid)
            expect(parsed.url).toBe(valid.url)
            expect(parsed.namespace).toBe('admin/tenant1')

            const withoutNamespace = {
                url: 'https://vault.example.com:8200',
                roleId: 'role_123',
                secretId: 'sec_456',
            }
            expect(HashicorpProviderConfigSchema.parse(withoutNamespace).namespace).toBeUndefined()
        })

        it('rejects HashicorpProviderConfigSchema missing required fields', () => {
            expect(() =>
                HashicorpProviderConfigSchema.parse({
                    url: '',
                    roleId: 'role_123',
                    secretId: 'sec_456',
                }),
            ).toThrowError(formErrors.required)
        })

        it('validates AWSProviderConfigSchema with required credentials', () => {
            const valid = {
                accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
                secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
                region: 'us-east-1',
            }
            const parsed = AWSProviderConfigSchema.parse(valid)
            expect(parsed.region).toBe('us-east-1')
        })

        it('rejects AWSProviderConfigSchema missing region or secretAccessKey', () => {
            expect(() =>
                AWSProviderConfigSchema.parse({
                    accessKeyId: 'AKIA',
                    region: 'us-east-1',
                }),
            ).toThrow()
        })

        it('validates CyberarkConjurProviderConfigSchema', () => {
            const valid = {
                organizationAccountName: 'my_org',
                loginId: 'host/bot',
                url: 'https://conjur.example.com',
                apiKey: 'apiKey123',
            }
            const parsed = CyberarkConjurProviderConfigSchema.parse(valid)
            expect(parsed.organizationAccountName).toBe('my_org')
            expect(parsed.loginId).toBe('host/bot')
        })

        it('validates OnePasswordProviderConfigSchema', () => {
            const valid = {
                serviceAccountToken: 'ops_token_secret_12345',
            }
            const parsed = OnePasswordProviderConfigSchema.parse(valid)
            expect(parsed.serviceAccountToken).toBe('ops_token_secret_12345')
        })
    })

    describe('ConnectSecretManagerRequestSchema discriminated union and scope refinement', () => {
        it('validates PLATFORM scope connection for HashiCorp Vault without projectIds', () => {
            const req = {
                name: 'Global Vault',
                scope: SecretManagerConnectionScope.PLATFORM,
                providerId: SecretManagerProviderId.HASHICORP,
                config: {
                    url: 'https://vault.internal',
                    roleId: 'role_xyz',
                    secretId: 'sec_xyz',
                },
            }
            const parsed = ConnectSecretManagerRequestSchema.parse(req)
            expect(parsed.name).toBe('Global Vault')
            expect(parsed.scope).toBe(SecretManagerConnectionScope.PLATFORM)
        })

        it('validates PROJECT scope connection when projectIds is populated', () => {
            const projectId = apId()
            const req = {
                name: 'Project 1Password',
                scope: SecretManagerConnectionScope.PROJECT,
                projectIds: [projectId],
                providerId: SecretManagerProviderId.ONEPASSWORD,
                config: {
                    serviceAccountToken: 'tok_123',
                },
            }
            const parsed = ConnectSecretManagerRequestSchema.parse(req)
            expect(parsed.projectIds).toEqual([projectId])
        })

        it('rejects PROJECT scope connection when projectIds is empty or missing', () => {
            const reqMissing = {
                name: 'Project AWS Secrets',
                scope: SecretManagerConnectionScope.PROJECT,
                providerId: SecretManagerProviderId.AWS,
                config: {
                    accessKeyId: 'AKIA',
                    secretAccessKey: 'sec',
                    region: 'eu-west-1',
                },
            }
            expect(() => ConnectSecretManagerRequestSchema.parse(reqMissing)).toThrowError(
                /Please select at least one project/,
            )

            const reqEmpty = {
                ...reqMissing,
                projectIds: [],
            }
            expect(() => ConnectSecretManagerRequestSchema.parse(reqEmpty)).toThrowError(
                /Please select at least one project/,
            )
        })

        it('rejects connection request when config does not match providerId', () => {
            const mismatched = {
                name: 'Mismatched',
                scope: SecretManagerConnectionScope.PLATFORM,
                providerId: SecretManagerProviderId.ONEPASSWORD,
                config: {
                    // HashiCorp fields instead of 1Password serviceAccountToken
                    url: 'https://vault.internal',
                    roleId: 'role_xyz',
                    secretId: 'sec_xyz',
                },
            }
            expect(() => ConnectSecretManagerRequestSchema.parse(mismatched)).toThrow()
        })
    })

    describe('DisconnectSecretManagerRequestSchema', () => {
        it('validates disconnect request with valid providerId', () => {
            const parsed = DisconnectSecretManagerRequestSchema.parse({
                providerId: SecretManagerProviderId.AWS,
            })
            expect(parsed.providerId).toBe(SecretManagerProviderId.AWS)
        })

        it('rejects disconnect request with invalid providerId', () => {
            expect(() =>
                DisconnectSecretManagerRequestSchema.parse({
                    providerId: 'unsupported_provider',
                }),
            ).toThrow()
        })
    })
})
