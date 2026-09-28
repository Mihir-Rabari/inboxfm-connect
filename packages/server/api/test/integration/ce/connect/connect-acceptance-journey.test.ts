import { apId } from '@inboxfm-connect/core-utils'
import { OAuth2AuthorizationMethod, PropertyType } from '@inboxfm-connect/pieces-framework'
import {
    AppConnectionScope,
    AppConnectionType,
    ConnectSession,
    ErrorCode,
    PackageType,
    PieceType,
} from '@inboxfm-connect/shared'
import { FastifyInstance } from 'fastify'
import { StatusCodes } from 'http-status-codes'
import { db } from '../../../helpers/db'
import {
    createMockConnectApiKey,
    createMockPieceMetadata,
    mockAndSaveBasicSetup,
} from '../../../helpers/mocks'
import { createTestContext } from '../../../helpers/test-context'
import { vi } from 'vitest'
import { executeRuntime } from '../../../../src/app/execute/execute.controller'
import { databaseConnection } from '../../../../src/app/database/database-connection'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null

beforeAll(async () => {
    app = await setupTestEnvironment()
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Connect Acceptance Journey (Issue #212)', () => {
    const SLACK_PIECE = '@inboxfm-connect/piece-slack'
    const SLACK_VERSION = '0.17.3'
    const TEXT_HELPER_PIECE = '@inboxfm-connect/piece-text-helper'
    const TEXT_HELPER_VERSION = '0.5.1'

    beforeEach(() => {
        vi.spyOn(executeRuntime, 'execute').mockImplementation(async (params) => {
            if (params.tool === 'concat') {
                const texts = (params.input as Record<string, unknown>).texts as string[]
                const separator = (params.input as Record<string, unknown>).separator as string
                return { result: texts.join(separator) }
            }
            return { result: 'acceptance-passed' }
        })
    })

    it('runs the complete consumer acceptance journey: OAuth config -> session -> redeem -> execute -> revoke', async () => {
        // 1. Setup Platform and Project
        const { mockPlatform, mockProject: projectA } = await mockAndSaveBasicSetup()

        // Seed platform-specific piece metadata with full OAuth definition for Slack
        await databaseConnection().getRepository('integration_metadata').delete([
            { name: SLACK_PIECE },
            { name: '@activepieces/piece-slack' },
            { name: 'slack' },
        ])
        const mockSlackPiece = createMockPieceMetadata({
            name: SLACK_PIECE,
            version: SLACK_VERSION,
            packageType: PackageType.REGISTRY,
            pieceType: PieceType.OFFICIAL,
            auth: {
                type: PropertyType.OAUTH2,
                authUrl: 'https://slack.com/oauth/v2/authorize',
                tokenUrl: 'https://slack.com/api/oauth.v2.access',
                scope: ['channels:read', 'chat:write'],
                required: true,
            },
        })
        await db.save('integration_metadata', mockSlackPiece)

        // 2. Operator configures platform-managed OAuth app for Slack
        const adminCtx = await createTestContext(app!, {
            platform: mockPlatform,
            project: projectA,
        })
        const oauthAppResponse = await adminCtx.post('/v1/connect-oauth-apps', {
            pieceName: SLACK_PIECE,
            clientId: 'operator-slack-client-id-12345',
            clientSecret: 'operator-slack-client-secret-xyz987',
        })
        expect(oauthAppResponse.statusCode).toBe(StatusCodes.OK)
        const oauthAppBody = oauthAppResponse.json()
        expect(oauthAppBody.clientId).toBe('operator-slack-client-id-12345')
        expect(oauthAppBody.clientSecret).toBeUndefined() // Secret must never leak

        // 3. Consumer backend provisions project-scoped Connect API Keys (cak-)
        const keyProjectA = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: projectA.id })
        await db.save('connect_api_key', keyProjectA)

        const customerAlice = 'customer_alice_42'

        // 4. Backend creates a Connect Session for customer Alice with restricted integrations
        const aliceSessionCreateRes = await app!.inject({
            method: 'POST',
            url: '/api/v1/connect-sessions',
            headers: { authorization: `Bearer ${keyProjectA.value}` },
            payload: {
                projectId: projectA.id,
                externalUserId: customerAlice,
                allowedPieceNames: [SLACK_PIECE, TEXT_HELPER_PIECE],
                expiresInSeconds: 300,
            },
        })
        expect(aliceSessionCreateRes.statusCode).toBe(StatusCodes.CREATED)
        const aliceSession = aliceSessionCreateRes.json()
        expect(aliceSession.token).toMatch(/^cs-/)
        expect(aliceSession.connectUrl).toContain(aliceSession.token)

        // 5. Browser reads public session info (no operator secret or Connect API key in response)
        const alicePublicInfoRes = await app!.inject({
            method: 'GET',
            url: `/api/v1/connect-sessions/${aliceSession.token}`,
        })
        expect(alicePublicInfoRes.statusCode).toBe(StatusCodes.OK)
        const alicePublicInfo = alicePublicInfoRes.json()
        expect(alicePublicInfo.projectId).toBe(projectA.id)
        expect(alicePublicInfo.externalUserId).toBe(customerAlice)
        expect(alicePublicInfo.allowedPieceNames).toEqual([SLACK_PIECE, TEXT_HELPER_PIECE])
        expect(alicePublicInfo.hashedToken).toBeUndefined()
        expect(alicePublicInfo.apiKey).toBeUndefined()

        // 6. Browser requests OAuth authorization URL for platform-configured Slack
        const authUrlRes = await app!.inject({
            method: 'POST',
            url: `/api/v1/connect-sessions/${aliceSession.token}/oauth2/authorization-url`,
            payload: {
                pieceName: SLACK_PIECE,
                pieceVersion: SLACK_VERSION,
                redirectUrl: 'https://consumer.example.com/oauth/callback',
            },
        })
        expect(authUrlRes.statusCode).toBe(StatusCodes.OK)
        const authUrlBody = authUrlRes.json()
        expect(authUrlBody.authorizationUrl).toContain('client_id=operator-slack-client-id-12345')
        expect(authUrlBody.authorizationUrl).toContain(encodeURIComponent('https://consumer.example.com/oauth/callback'))
        // Operator clientSecret must never be sent to the browser
        expect(JSON.stringify(authUrlBody)).not.toContain('operator-slack-client-secret-xyz987')

        // 7. Customer authorizes: browser redeems token to create Slack connection
        const redeemSlackRes = await app!.inject({
            method: 'POST',
            url: `/api/v1/connect-sessions/${aliceSession.token}/connections`,
            payload: {
                projectId: projectA.id,
                externalId: customerAlice,
                displayName: "Alice's Slack Workspace",
                pieceName: SLACK_PIECE,
                pieceVersion: SLACK_VERSION,
                type: AppConnectionType.PLATFORM_OAUTH2,
                value: {
                    type: AppConnectionType.PLATFORM_OAUTH2,
                    client_id: 'browser-cannot-override',
                    token_url: 'https://slack.com/api/oauth.v2.access',
                    authorization_method: OAuth2AuthorizationMethod.HEADER,
                    code: 'sandbox-oauth-code-alice',
                    redirect_url: 'https://consumer.example.com/oauth/callback',
                    scope: 'channels:read chat:write',
                    props: {},
                },
            },
        })
        expect(redeemSlackRes.statusCode).toBe(StatusCodes.CREATED)
        const aliceSlackConn = redeemSlackRes.json()
        expect(aliceSlackConn.externalId).toBe(customerAlice)
        expect(aliceSlackConn.projectIds).toEqual([projectA.id])
        expect(aliceSlackConn.pieceName).toBe(SLACK_PIECE)
        expect(aliceSlackConn.value).toBeUndefined() // Sanitized in public response

        // 8. Single-use invariant: redeeming the token a second time must fail with SESSION_EXPIRED (403)
        const secondRedeemRes = await app!.inject({
            method: 'POST',
            url: `/api/v1/connect-sessions/${aliceSession.token}/connections`,
            payload: {
                projectId: projectA.id,
                externalId: customerAlice,
                displayName: 'Alice Duplicate Connection',
                pieceName: SLACK_PIECE,
                pieceVersion: SLACK_VERSION,
                type: AppConnectionType.SECRET_TEXT,
                value: { type: AppConnectionType.SECRET_TEXT, secret_text: 'ignored' },
            },
        })
        expect(secondRedeemRes.statusCode).toBe(StatusCodes.FORBIDDEN)
        expect(secondRedeemRes.json().code).toBe(ErrorCode.SESSION_EXPIRED)

        // 9. Create a Text Helper connection for Alice so we can test end-to-end execution
        const aliceTextSessionRes = await app!.inject({
            method: 'POST',
            url: '/api/v1/connect-sessions',
            headers: { authorization: `Bearer ${keyProjectA.value}` },
            payload: {
                projectId: projectA.id,
                externalUserId: customerAlice,
                allowedPieceNames: [TEXT_HELPER_PIECE],
            },
        })
        const aliceTextSession = aliceTextSessionRes.json()

        const redeemAliceTextRes = await app!.inject({
            method: 'POST',
            url: `/api/v1/connect-sessions/${aliceTextSession.token}/connections`,
            payload: {
                projectId: projectA.id,
                externalId: customerAlice,
                displayName: 'Alice Text Helper',
                pieceName: TEXT_HELPER_PIECE,
                pieceVersion: TEXT_HELPER_VERSION,
                type: AppConnectionType.SECRET_TEXT,
                value: {
                    type: AppConnectionType.SECRET_TEXT,
                    secret_text: 'alice-secret-token',
                },
            },
        })
        expect(redeemAliceTextRes.statusCode).toBe(StatusCodes.CREATED)
        const aliceTextConn = redeemAliceTextRes.json()
        expect(aliceTextConn.externalId).toBe(customerAlice)

        // 10. Execute tool via externalUserId
        const executeByExternalUserRes = await app!.inject({
            method: 'POST',
            url: '/api/v1/execute',
            headers: { authorization: `Bearer ${keyProjectA.value}` },
            payload: {
                projectId: projectA.id,
                integration: TEXT_HELPER_PIECE,
                tool: 'concat',
                externalUserId: customerAlice,
                input: { texts: ['acceptance', 'passed'], separator: '-' },
            },
        })
        expect(executeByExternalUserRes.statusCode).toBe(StatusCodes.OK)
        expect(executeByExternalUserRes.json()).toEqual({ result: 'acceptance-passed' })

        // 11. Execute tool via explicit connectionId
        const executeByConnIdRes = await app!.inject({
            method: 'POST',
            url: '/api/v1/execute',
            headers: { authorization: `Bearer ${keyProjectA.value}` },
            payload: {
                projectId: projectA.id,
                integration: TEXT_HELPER_PIECE,
                tool: 'concat',
                connectionId: aliceTextConn.id,
                input: { texts: ['explicit', 'conn'], separator: '_' },
            },
        })
        expect(executeByConnIdRes.statusCode).toBe(StatusCodes.OK)
        expect(executeByConnIdRes.json()).toEqual({ result: 'explicit_conn' })

        // 12. Revocation: Delete connection
        const deleteConnRes = await adminCtx.delete(`/v1/connections/${aliceTextConn.id}`)
        expect(deleteConnRes.statusCode).toBe(StatusCodes.NO_CONTENT)

        // 13. Execution after revocation fails
        const executePostRevocationRes = await app!.inject({
            method: 'POST',
            url: '/api/v1/execute',
            headers: { authorization: `Bearer ${keyProjectA.value}` },
            payload: {
                projectId: projectA.id,
                integration: TEXT_HELPER_PIECE,
                tool: 'concat',
                connectionId: aliceTextConn.id,
                input: { texts: ['fail'], separator: '-' },
            },
        })
        expect(executePostRevocationRes.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    describe('Cross-Customer & Cross-Project Substitution Matrix', () => {
        it('prevents customer Bob from substituting customer Alice connection ID', async () => {
            const { mockPlatform, mockProject } = await mockAndSaveBasicSetup()
            const key = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: mockProject.id })
            await db.save('connect_api_key', key)

            // Setup Alice connection
            const aliceSessionRes = await app!.inject({
                method: 'POST',
                url: '/api/v1/connect-sessions',
                headers: { authorization: `Bearer ${key.value}` },
                payload: { projectId: mockProject.id, externalUserId: 'alice', allowedPieceNames: [TEXT_HELPER_PIECE] },
            })
            const aliceSession = aliceSessionRes.json()
            const aliceConnRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/connect-sessions/${aliceSession.token}/connections`,
                payload: {
                    projectId: mockProject.id,
                    externalId: 'alice',
                    displayName: 'Alice Connection',
                    pieceName: TEXT_HELPER_PIECE,
                    pieceVersion: TEXT_HELPER_VERSION,
                    type: AppConnectionType.SECRET_TEXT,
                    value: { type: AppConnectionType.SECRET_TEXT, secret_text: 'alice-key' },
                },
            })
            const aliceConn = aliceConnRes.json()

            // Bob tries to execute by passing Alice's connectionId with Bob's externalUserId
            const bobSubstitutedRes = await app!.inject({
                method: 'POST',
                url: '/api/v1/execute',
                headers: { authorization: `Bearer ${key.value}` },
                payload: {
                    projectId: mockProject.id,
                    integration: TEXT_HELPER_PIECE,
                    tool: 'concat',
                    connectionId: aliceConn.id,
                    externalUserId: 'bob',
                    input: { texts: ['unauthorized'] },
                },
            })
            expect(bobSubstitutedRes.statusCode).toBe(StatusCodes.NOT_FOUND)
            expect(bobSubstitutedRes.json().code).toBe(ErrorCode.ENTITY_NOT_FOUND)

            // Bob tries to execute with Bob's externalUserId alone (has no connection)
            const bobNoConnRes = await app!.inject({
                method: 'POST',
                url: '/api/v1/execute',
                headers: { authorization: `Bearer ${key.value}` },
                payload: {
                    projectId: mockProject.id,
                    integration: TEXT_HELPER_PIECE,
                    tool: 'concat',
                    externalUserId: 'bob',
                    input: { texts: ['unauthorized'] },
                },
            })
            expect(bobNoConnRes.statusCode).toBe(StatusCodes.NOT_FOUND)
            expect(bobNoConnRes.json().code).toBe(ErrorCode.ENTITY_NOT_FOUND)
        })

        it('prevents Project B from executing using Project A connection ID', async () => {
            const { mockPlatform, mockProject: projectA } = await mockAndSaveBasicSetup()
            const { mockProject: projectB } = await mockAndSaveBasicSetup({ platform: { id: mockPlatform.id } })

            const keyA = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: projectA.id })
            const keyB = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: projectB.id })
            await db.save('connect_api_key', [keyA, keyB])

            // Create connection in project A
            const sessionA = await app!.inject({
                method: 'POST',
                url: '/api/v1/connect-sessions',
                headers: { authorization: `Bearer ${keyA.value}` },
                payload: { projectId: projectA.id, externalUserId: 'user-a', allowedPieceNames: [TEXT_HELPER_PIECE] },
            })
            const connARes = await app!.inject({
                method: 'POST',
                url: `/api/v1/connect-sessions/${sessionA.json().token}/connections`,
                payload: {
                    projectId: projectA.id,
                    externalId: 'user-a',
                    displayName: 'Project A Connection',
                    pieceName: TEXT_HELPER_PIECE,
                    pieceVersion: TEXT_HELPER_VERSION,
                    type: AppConnectionType.SECRET_TEXT,
                    value: { type: AppConnectionType.SECRET_TEXT, secret_text: 'key-a' },
                },
            })
            const connA = connARes.json()
            expect(connA.id).toBeDefined()

            // Project B attempts to execute using Project A's connectionId
            const crossProjectRes = await app!.inject({
                method: 'POST',
                url: '/api/v1/execute',
                headers: { authorization: `Bearer ${keyB.value}` },
                payload: {
                    projectId: projectB.id,
                    integration: TEXT_HELPER_PIECE,
                    tool: 'concat',
                    connectionId: connA.id,
                    input: { texts: ['cross-project'] },
                },
            })
            expect(crossProjectRes.statusCode).toBe(StatusCodes.NOT_FOUND)
            expect(crossProjectRes.json().code).toBe(ErrorCode.ENTITY_NOT_FOUND)
        })

        it('rejects execution if connectionId belongs to a different piece', async () => {
            const { mockPlatform, mockProject } = await mockAndSaveBasicSetup()
            const key = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: mockProject.id })
            await db.save('connect_api_key', key)

            const session = await app!.inject({
                method: 'POST',
                url: '/api/v1/connect-sessions',
                headers: { authorization: `Bearer ${key.value}` },
                payload: { projectId: mockProject.id, externalUserId: 'test-user', allowedPieceNames: [TEXT_HELPER_PIECE] },
            })
            const connRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/connect-sessions/${session.json().token}/connections`,
                payload: {
                    projectId: mockProject.id,
                    externalId: 'test-user',
                    displayName: 'Text Helper Connection',
                    pieceName: TEXT_HELPER_PIECE,
                    pieceVersion: TEXT_HELPER_VERSION,
                    type: AppConnectionType.SECRET_TEXT,
                    value: { type: AppConnectionType.SECRET_TEXT, secret_text: 'key-123' },
                },
            })
            const conn = connRes.json()
            expect(conn.id).toBeDefined()

            // Caller passes Text Helper connection ID but specifies Slack integration
            const mismatchRes = await app!.inject({
                method: 'POST',
                url: '/api/v1/execute',
                headers: { authorization: `Bearer ${key.value}` },
                payload: {
                    projectId: mockProject.id,
                    integration: SLACK_PIECE,
                    tool: 'send_channel_message',
                    connectionId: conn.id,
                    input: {},
                },
            })
            expect(mismatchRes.statusCode).toBe(StatusCodes.BAD_REQUEST)
            expect(mismatchRes.json().code).toBe(ErrorCode.INVALID_APP_CONNECTION)
        })
    })

    describe('Session Expiry, Concurrency & Security Restrictions', () => {
        it('handles concurrent redemptions: exactly one succeeds and the race loser receives SESSION_EXPIRED', async () => {
            const { mockPlatform, mockProject } = await mockAndSaveBasicSetup()
            const key = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: mockProject.id })
            await db.save('connect_api_key', key)

            const sessionRes = await app!.inject({
                method: 'POST',
                url: '/api/v1/connect-sessions',
                headers: { authorization: `Bearer ${key.value}` },
                payload: { projectId: mockProject.id, externalUserId: 'racing-user', allowedPieceNames: [TEXT_HELPER_PIECE] },
            })
            const { token } = sessionRes.json()

            // Dispatch two simultaneous redemption requests with valid schema
            const payload = {
                projectId: mockProject.id,
                externalId: 'racing-user',
                displayName: 'Racing Connection',
                pieceName: TEXT_HELPER_PIECE,
                pieceVersion: TEXT_HELPER_VERSION,
                type: AppConnectionType.SECRET_TEXT,
                value: { type: AppConnectionType.SECRET_TEXT, secret_text: 'race' },
            }

            const [res1, res2] = await Promise.all([
                app!.inject({ method: 'POST', url: `/api/v1/connect-sessions/${token}/connections`, payload }),
                app!.inject({ method: 'POST', url: `/api/v1/connect-sessions/${token}/connections`, payload }),
            ])

            const statusCodes = [res1.statusCode, res2.statusCode].sort()
            expect(statusCodes).toEqual([StatusCodes.CREATED, StatusCodes.FORBIDDEN])

            const failedResponse = res1.statusCode === StatusCodes.FORBIDDEN ? res1.json() : res2.json()
            expect(failedResponse.code).toBe(ErrorCode.SESSION_EXPIRED)

            // Verify only 1 connection exists for this user in the database
            const connections = await db.findManyBy('app_connection', { externalId: 'racing-user' })
            expect(connections).toHaveLength(1)
        })

        it('rejects redemptions of expired sessions', async () => {
            const { mockPlatform, mockProject } = await mockAndSaveBasicSetup()
            const key = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: mockProject.id })
            await db.save('connect_api_key', key)

            const sessionRes = await app!.inject({
                method: 'POST',
                url: '/api/v1/connect-sessions',
                headers: { authorization: `Bearer ${key.value}` },
                payload: {
                    projectId: mockProject.id,
                    externalUserId: 'expired-user',
                    expiresInSeconds: 300,
                },
            })
            const { token } = sessionRes.json()

            // Manually expire the session in the database
            const session = await db.findOneByOrFail<ConnectSession>('connect_session', { externalUserId: 'expired-user' })
            const pastDate = new Date(Date.now() - 60_000).toISOString()
            await db.update('connect_session', session.id, { expiresAt: pastDate })

            const redeemRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/connect-sessions/${token}/connections`,
                payload: {
                    projectId: mockProject.id,
                    externalId: 'expired-user',
                    displayName: 'Expired Connection',
                    pieceName: TEXT_HELPER_PIECE,
                    pieceVersion: TEXT_HELPER_VERSION,
                    type: AppConnectionType.SECRET_TEXT,
                    value: { type: AppConnectionType.SECRET_TEXT, secret_text: 'exp' },
                },
            })
            expect(redeemRes.statusCode).toBe(StatusCodes.FORBIDDEN)
            expect(redeemRes.json().code).toBe(ErrorCode.SESSION_EXPIRED)
        })

        it('enforces piece restrictions: rejects unauthorized pieces for the session', async () => {
            const { mockPlatform, mockProject } = await mockAndSaveBasicSetup()
            const key = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: mockProject.id })
            await db.save('connect_api_key', key)

            const sessionRes = await app!.inject({
                method: 'POST',
                url: '/api/v1/connect-sessions',
                headers: { authorization: `Bearer ${key.value}` },
                payload: {
                    projectId: mockProject.id,
                    externalUserId: 'restricted-user',
                    allowedPieceNames: [TEXT_HELPER_PIECE], // Only text-helper allowed
                },
            })
            const { token } = sessionRes.json()

            // Attempt to connect Slack with this session
            const unallowedRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/connect-sessions/${token}/connections`,
                payload: {
                    projectId: mockProject.id,
                    externalId: 'restricted-user',
                    displayName: 'Unallowed Slack Connection',
                    pieceName: SLACK_PIECE,
                    pieceVersion: SLACK_VERSION,
                    type: AppConnectionType.SECRET_TEXT,
                    value: { type: AppConnectionType.SECRET_TEXT, secret_text: 'unallowed' },
                },
            })
            expect(unallowedRes.statusCode).toBe(StatusCodes.FORBIDDEN)
            expect(unallowedRes.json().code).toBe(ErrorCode.AUTHORIZATION)
        })

        it('rejects unsupported connection types through connect sessions', async () => {
            const { mockPlatform, mockProject } = await mockAndSaveBasicSetup()
            const key = createMockConnectApiKey({ platformId: mockPlatform.id, projectId: mockProject.id })
            await db.save('connect_api_key', key)

            const sessionRes = await app!.inject({
                method: 'POST',
                url: '/api/v1/connect-sessions',
                headers: { authorization: `Bearer ${key.value}` },
                payload: { projectId: mockProject.id, externalUserId: 'test-user' },
            })
            const { token } = sessionRes.json()

            // CLOUD_OAUTH2 is not supported for anonymous connect sessions
            const cloudAuthRes = await app!.inject({
                method: 'POST',
                url: `/api/v1/connect-sessions/${token}/connections`,
                payload: {
                    projectId: mockProject.id,
                    externalId: 'test-user',
                    displayName: 'Cloud Auth',
                    pieceName: TEXT_HELPER_PIECE,
                    pieceVersion: TEXT_HELPER_VERSION,
                    type: AppConnectionType.CLOUD_OAUTH2,
                    value: {
                        type: AppConnectionType.CLOUD_OAUTH2,
                        client_id: 'cloud-client',
                        code: '123',
                        scope: 'all',
                    },
                },
            })
            expect(cloudAuthRes.statusCode).toBe(StatusCodes.BAD_REQUEST)
            expect(cloudAuthRes.json().code).toBe(ErrorCode.INVALID_APP_CONNECTION)
        })
    })
})
