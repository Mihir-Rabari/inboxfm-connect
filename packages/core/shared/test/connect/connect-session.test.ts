import { apId } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import {
    ConnectSession,
    ConnectSessionPublicInfo,
    CreateConnectSessionRequest,
    CreateConnectSessionResponse,
} from '../../src/lib/connect-session'

describe('ConnectSession schemas', () => {
    const validSession = {
        id: apId(),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        projectId: apId(),
        externalUserId: 'usr_ext_12345',
        allowedPieceNames: ['slack', 'github'],
        hashedToken: 'hash_abc123xyz',
        truncatedToken: 'tok_...xyz',
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
        consumedAt: null,
    }

    describe('ConnectSession model schema', () => {
        it('validates a complete connect session with allowedPieceNames', () => {
            const parsed = ConnectSession.parse(validSession)
            expect(parsed.id).toBe(validSession.id)
            expect(parsed.projectId).toBe(validSession.projectId)
            expect(parsed.externalUserId).toBe('usr_ext_12345')
            expect(parsed.allowedPieceNames).toEqual(['slack', 'github'])
            expect(parsed.consumedAt).toBeNull()
        })

        it('validates session when allowedPieceNames is null (unrestricted)', () => {
            const parsed = ConnectSession.parse({
                ...validSession,
                allowedPieceNames: null,
            })
            expect(parsed.allowedPieceNames).toBeNull()
        })

        it('validates session when consumedAt is an ISO string', () => {
            const consumedIso = new Date().toISOString()
            const parsed = ConnectSession.parse({
                ...validSession,
                consumedAt: consumedIso,
            })
            expect(parsed.consumedAt).toBe(consumedIso)
        })

        it('rejects session when required fields are missing', () => {
            const invalid = { ...validSession }
            delete (invalid as Record<string, unknown>).externalUserId
            expect(() => ConnectSession.parse(invalid)).toThrow()
        })
    })

    describe('CreateConnectSessionRequest schema', () => {
        it('accepts valid request with required fields only', () => {
            const parsed = CreateConnectSessionRequest.parse({
                projectId: apId(),
                externalUserId: 'ext_cust_789',
            })
            expect(parsed.externalUserId).toBe('ext_cust_789')
            expect(parsed.allowedPieceNames).toBeUndefined()
            expect(parsed.expiresInSeconds).toBeUndefined()
        })

        it('accepts valid request with piece list and expiresInSeconds', () => {
            const parsed = CreateConnectSessionRequest.parse({
                projectId: apId(),
                externalUserId: 'ext_cust_789',
                allowedPieceNames: ['hubspot', 'notion'],
                expiresInSeconds: 1800,
            })
            expect(parsed.allowedPieceNames).toEqual(['hubspot', 'notion'])
            expect(parsed.expiresInSeconds).toBe(1800)
        })

        it('rejects empty externalUserId', () => {
            expect(() =>
                CreateConnectSessionRequest.parse({
                    projectId: apId(),
                    externalUserId: '',
                }),
            ).toThrow()
        })

        it('rejects expiresInSeconds that is 0 or negative', () => {
            expect(() =>
                CreateConnectSessionRequest.parse({
                    projectId: apId(),
                    externalUserId: 'cust_1',
                    expiresInSeconds: 0,
                }),
            ).toThrow()

            expect(() =>
                CreateConnectSessionRequest.parse({
                    projectId: apId(),
                    externalUserId: 'cust_1',
                    expiresInSeconds: -60,
                }),
            ).toThrow()
        })

        it('rejects expiresInSeconds exceeding maximum 3600 (1 hour)', () => {
            expect(() =>
                CreateConnectSessionRequest.parse({
                    projectId: apId(),
                    externalUserId: 'cust_1',
                    expiresInSeconds: 3601,
                }),
            ).toThrow()
        })

        it('rejects invalid non-apId projectId', () => {
            expect(() =>
                CreateConnectSessionRequest.parse({
                    projectId: 'invalid_id!',
                    externalUserId: 'cust_1',
                }),
            ).toThrow()
        })
    })

    describe('CreateConnectSessionResponse schema', () => {
        it('validates response with token, connectUrl, and expiresAt', () => {
            const iso = new Date().toISOString()
            const parsed = CreateConnectSessionResponse.parse({
                token: 'raw_session_token_abc',
                connectUrl: 'https://connect.example.com/session?token=raw_session_token_abc',
                expiresAt: iso,
            })
            expect(parsed.token).toBe('raw_session_token_abc')
            expect(parsed.connectUrl).toContain('connect.example.com')
            expect(parsed.expiresAt).toBe(iso)
        })

        it('rejects response missing connectUrl or token', () => {
            expect(() =>
                CreateConnectSessionResponse.parse({
                    token: 'tok',
                }),
            ).toThrow()
        })
    })

    describe('ConnectSessionPublicInfo schema', () => {
        it('validates public info projection', () => {
            const parsed = ConnectSessionPublicInfo.parse({
                projectId: apId(),
                externalUserId: 'cust_999',
                allowedPieceNames: ['slack'],
                expiresAt: new Date().toISOString(),
            })
            expect(parsed.externalUserId).toBe('cust_999')
            expect(parsed.allowedPieceNames).toEqual(['slack'])
        })

        it('permits null for allowedPieceNames', () => {
            const parsed = ConnectSessionPublicInfo.parse({
                projectId: apId(),
                externalUserId: 'cust_999',
                allowedPieceNames: null,
                expiresAt: new Date().toISOString(),
            })
            expect(parsed.allowedPieceNames).toBeNull()
        })
    })
})
