import { apId } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import { ExecuteRequestBody } from '../../src/lib/connect-execute/execute-request'
import { ConnectOAuthApp, UpsertConnectOAuthAppRequest } from '../../src/lib/connect-oauth-app'

describe('ConnectOAuthApp schemas', () => {
    it('validates a complete ConnectOAuthApp model', () => {
        const model = {
            id: apId(),
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            platformId: apId(),
            pieceName: 'slack',
            clientId: '123456789.apps.googleusercontent.com',
        }
        const parsed = ConnectOAuthApp.parse(model)
        expect(parsed.pieceName).toBe('slack')
        expect(parsed.clientId).toBe(model.clientId)
    })

    it('rejects ConnectOAuthApp missing pieceName or clientId', () => {
        expect(() =>
            ConnectOAuthApp.parse({
                id: apId(),
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                platformId: apId(),
            }),
        ).toThrow()
    })

    it('validates UpsertConnectOAuthAppRequest with required fields', () => {
        const req = {
            pieceName: 'github',
            clientId: 'gh_client_id_001',
            clientSecret: 'gh_client_secret_xyz987',
        }
        const parsed = UpsertConnectOAuthAppRequest.parse(req)
        expect(parsed.pieceName).toBe('github')
        expect(parsed.clientId).toBe('gh_client_id_001')
        expect(parsed.clientSecret).toBe('gh_client_secret_xyz987')
    })

    it('rejects UpsertConnectOAuthAppRequest when clientSecret is missing', () => {
        expect(() =>
            UpsertConnectOAuthAppRequest.parse({
                pieceName: 'github',
                clientId: 'gh_client_id_001',
            }),
        ).toThrow()
    })
})

describe('ExecuteRequestBody schema', () => {
    it('validates execution request with required integration, tool, and input', () => {
        const req = {
            integration: 'slack',
            tool: 'send_message',
            input: {
                channel: '#general',
                text: 'Hello from autonomous agent!',
            },
        }
        const parsed = ExecuteRequestBody.parse(req)
        expect(parsed.integration).toBe('slack')
        expect(parsed.tool).toBe('send_message')
        expect(parsed.input).toEqual({
            channel: '#general',
            text: 'Hello from autonomous agent!',
        })
        expect(parsed.connectionId).toBeUndefined()
        expect(parsed.externalUserId).toBeUndefined()
        expect(parsed.projectId).toBeUndefined()
    })

    it('validates execution request with optional context identifiers', () => {
        const req = {
            projectId: apId(),
            integration: 'notion',
            tool: 'create_page',
            connectionId: 'conn_123',
            externalUserId: 'cust_456',
            input: {
                parent_database: 'db_789',
                title: 'New Page',
            },
        }
        const parsed = ExecuteRequestBody.parse(req)
        expect(parsed.connectionId).toBe('conn_123')
        expect(parsed.externalUserId).toBe('cust_456')
    })

    it('rejects execution request when input is not a record', () => {
        expect(() =>
            ExecuteRequestBody.parse({
                integration: 'slack',
                tool: 'send_message',
                input: 'not an object',
            }),
        ).toThrow()
    })

    it('rejects execution request when required tool or integration is missing', () => {
        expect(() =>
            ExecuteRequestBody.parse({
                integration: 'slack',
                input: {},
            }),
        ).toThrow()
    })
})
