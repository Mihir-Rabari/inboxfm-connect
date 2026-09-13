import { AddressInfo } from 'net'
import { apId } from '@inboxfm-connect/core-utils'
import { ContextVersion, StoreScope } from '@inboxfm-connect/pieces-framework'
import { AppConnectionStatus, AppConnectionType, ConnectionExpiredError, ConnectionNotFoundError, PrincipalType } from '@inboxfm-connect/shared'
import { FastifyInstance } from 'fastify'
import { createConnectionResolver } from '../../../../../engine/src/lib/piece-context/connection-resolver'
import { createFileUploader } from '../../../../../engine/src/lib/piece-context/file-uploader'
import { createContextStore } from '../../../../../engine/src/lib/piece-context/store'
import { encryptUtils } from '../../../../src/app/helper/encryption'
import { generateMockToken } from '../../../helpers/auth'
import { db } from '../../../helpers/db'
import {
    createMockConnection,
    mockAndSaveBasicSetup,
} from '../../../helpers/mocks'
import { setupTestEnvironment, teardownTestEnvironment } from '../../../helpers/test-setup'

let app: FastifyInstance | null = null
let apiUrl: string

beforeAll(async () => {
    app = await setupTestEnvironment()
    if (!app.server.listening) {
        await app.listen({ port: 0, host: '127.0.0.1' })
    }
    const port = (app.server.address() as AddressInfo).port
    apiUrl = `http://127.0.0.1:${port}/api/`
})

afterAll(async () => {
    await teardownTestEnvironment()
})

describe('Engine Services Integration', () => {
    let engineToken: string
    let projectId: string
    let platformId: string
    let ownerId: string

    beforeEach(async () => {
        const { mockPlatform, mockProject, mockOwner } = await mockAndSaveBasicSetup()
        projectId = mockProject.id
        platformId = mockPlatform.id
        ownerId = mockOwner.id

        engineToken = await generateMockToken({
            type: PrincipalType.ENGINE,
            id: apId(),
            projectId,
            platform: { id: platformId },
        })
    })

    // REMOVED: the `flows.service � createFlowsContext().list()` block tested the
    // engine Flow Runtime context (`GET /v1/worker/flows` + the `flow`/`flow_version`
    // tables), all deleted in the HeadlessRuntime migration. The context module still
    // exists but has no backing route or tables, and the block depended on the removed
    // `createMockFlow`/`createMockFlowVersion` mocks. The surviving engine services
    // (connections, storage, step-files) are exercised below.
    describe('connections.service — createConnectionResolver().obtain()', () => {
        it('should obtain connection value with V1 context', async () => {
            const externalId = apId()
            const secretText = 'my-super-secret'
            const connectionValue = {
                type: AppConnectionType.SECRET_TEXT,
                secret_text: secretText,
            }
            const encryptedValue = await encryptUtils.encryptObject(connectionValue)

            const mockConn = createMockConnection({
                platformId,
                projectIds: [projectId],
                externalId,
                status: AppConnectionStatus.ACTIVE,
            }, ownerId)

            await db.save('app_connection', {
                ...mockConn,
                value: encryptedValue,
            })

            const connectionService = createConnectionResolver({
                projectId,
                engineToken,
                apiUrl,
                contextVersion: ContextVersion.V1,
            })

            const result = await connectionService.obtain(externalId)

            expect(result).toEqual({
                type: AppConnectionType.SECRET_TEXT,
                secret_text: secretText,
            })
        })

        it('should return raw secret_text for V0 context (undefined)', async () => {
            const externalId = apId()
            const secretText = 'v0-secret-value'
            const connectionValue = {
                type: AppConnectionType.SECRET_TEXT,
                secret_text: secretText,
            }
            const encryptedValue = await encryptUtils.encryptObject(connectionValue)

            const mockConn = createMockConnection({
                platformId,
                projectIds: [projectId],
                externalId,
                status: AppConnectionStatus.ACTIVE,
            }, ownerId)

            await db.save('app_connection', {
                ...mockConn,
                value: encryptedValue,
            })

            const connectionService = createConnectionResolver({
                projectId,
                engineToken,
                apiUrl,
                contextVersion: undefined,
            })

            const result = await connectionService.obtain(externalId)

            expect(result).toBe(secretText)
        })

        it('should throw ConnectionNotFoundError for missing connection', async () => {
            const connectionService = createConnectionResolver({
                projectId,
                engineToken,
                apiUrl,
                contextVersion: ContextVersion.V1,
            })

            await expect(connectionService.obtain('non-existent-id')).rejects.toThrow(ConnectionNotFoundError)
        })

        it('should throw ConnectionExpiredError when connection status is ERROR', async () => {
            const externalId = apId()
            const connectionValue = {
                type: AppConnectionType.SECRET_TEXT,
                secret_text: 'expired-secret',
            }
            const encryptedValue = await encryptUtils.encryptObject(connectionValue)

            const mockConn = createMockConnection({
                platformId,
                projectIds: [projectId],
                externalId,
            }, ownerId)

            await db.save('app_connection', {
                ...mockConn,
                status: AppConnectionStatus.ERROR,
                value: encryptedValue,
            })

            const connectionService = createConnectionResolver({
                projectId,
                engineToken,
                apiUrl,
                contextVersion: ContextVersion.V1,
            })

            await expect(connectionService.obtain(externalId)).rejects.toThrow(ConnectionExpiredError)
        })
    })

    describe('storage.service — createContextStore().put/get/delete()', () => {
        it('should put and get a value', async () => {
            const store = createContextStore({
                apiUrl,
                prefix: '',
                flowId: apId(),
                engineToken,
            })

            const putResult = await store.put('myKey', { hello: 'world' })
            expect(putResult).toEqual({ hello: 'world' })

            const getResult = await store.get('myKey')
            expect(getResult).toEqual({ hello: 'world' })
        })

        it('should return null for non-existent key', async () => {
            const store = createContextStore({
                apiUrl,
                prefix: '',
                flowId: apId(),
                engineToken,
            })

            const result = await store.get('non-existent-key')
            expect(result).toBeNull()
        })

        it('should delete a value', async () => {
            const store = createContextStore({
                apiUrl,
                prefix: '',
                flowId: apId(),
                engineToken,
            })

            await store.put('deleteMe', { data: 'value' })
            await store.delete('deleteMe')
            const result = await store.get('deleteMe')
            expect(result).toBeNull()
        })

        it('should isolate flow-scoped vs project-scoped keys', async () => {
            const flowId = apId()
            const store = createContextStore({
                apiUrl,
                prefix: 'test_',
                flowId,
                engineToken,
            })

            await store.put('sharedKey', { scope: 'flow' }, StoreScope.FLOW)
            await store.put('sharedKey', { scope: 'project' }, StoreScope.PROJECT)

            const flowValue = await store.get('sharedKey', StoreScope.FLOW)
            expect(flowValue).toEqual({ scope: 'flow' })

            const projectValue = await store.get('sharedKey', StoreScope.PROJECT)
            expect(projectValue).toEqual({ scope: 'project' })
        })
    })

    describe('step-files.service — createFileUploader().write()', () => {
        it('should upload a file and return a URL', async () => {
            const originalMaxFileSize = process.env.AP_MAX_FILE_SIZE_MB
            process.env.AP_MAX_FILE_SIZE_MB = '10'

            try {
                const uploader = createFileUploader({
                    apiUrl,
                    engineToken,
                })

                const result = await uploader.write({
                    fileName: 'test.txt',
                    data: Buffer.from('hello world'),
                })

                expect(typeof result).toBe('string')
                expect(result).toContain('/v1/files/')
            }
            finally {
                if (originalMaxFileSize === undefined) {
                    delete process.env.AP_MAX_FILE_SIZE_MB
                }
                else {
                    process.env.AP_MAX_FILE_SIZE_MB = originalMaxFileSize
                }
            }
        })

        it('should throw FileSizeError when data exceeds max size', async () => {
            const originalMaxFileSize = process.env.AP_MAX_FILE_SIZE_MB
            process.env.AP_MAX_FILE_SIZE_MB = '0.000001'

            try {
                const uploader = createFileUploader({
                    apiUrl,
                    engineToken,
                })

                await expect(
                    uploader.write({
                        fileName: 'large.txt',
                        data: Buffer.from('this data is too large for the limit'),
                    }),
                ).rejects.toThrow()
            }
            finally {
                if (originalMaxFileSize === undefined) {
                    delete process.env.AP_MAX_FILE_SIZE_MB
                }
                else {
                    process.env.AP_MAX_FILE_SIZE_MB = originalMaxFileSize
                }
            }
        })
    })
})
