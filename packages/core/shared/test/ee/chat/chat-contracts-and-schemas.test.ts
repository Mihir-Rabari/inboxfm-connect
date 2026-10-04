import { describe, expect, it } from 'vitest'
import {
    CHAT_ALLOWED_MIME_TYPES,
    ChatConversation,
    ChatConversationStatus,
    chatPersistenceUtils,
    CreateChatConversationRequest,
    PersistedChatMessageSchema,
    PersistedChatPartType,
    PersistedChatRole,
    PersistedToolCallStatus,
    SendChatMessageRequest,
    SimulateChatRequest,
    UpdateChatConversationRequest,
} from '../../../src/lib/ee/chat'

describe('Chat Contracts and Schemas (#141)', () => {
    describe('ChatMessageFile constraints and allowed mime types', () => {
        it('includes standard image, document, text, and data formats in CHAT_ALLOWED_MIME_TYPES', () => {
            expect(CHAT_ALLOWED_MIME_TYPES).toContain('image/png')
            expect(CHAT_ALLOWED_MIME_TYPES).toContain('image/jpeg')
            expect(CHAT_ALLOWED_MIME_TYPES).toContain('text/plain')
            expect(CHAT_ALLOWED_MIME_TYPES).toContain('text/csv')
            expect(CHAT_ALLOWED_MIME_TYPES).toContain('application/json')
            expect(CHAT_ALLOWED_MIME_TYPES).toContain('application/pdf')
        })

        it('accepts valid file attachments within SendChatMessageRequest', () => {
            const parsed = SendChatMessageRequest.parse({
                content: 'Please inspect the uploaded dataset',
                files: [
                    {
                        name: 'report.pdf',
                        mimeType: 'application/pdf',
                        data: 'JVBERi0xLjQKJ...',
                    },
                ],
            })
            expect(parsed.files?.length).toBe(1)
            expect(parsed.files?.[0].name).toBe('report.pdf')
        })

        it('rejects filename containing illegal control characters', () => {
            const result = SendChatMessageRequest.safeParse({
                content: 'Testing invalid filename',
                files: [
                    {
                        name: 'evil\x00file.png',
                        mimeType: 'image/png',
                        data: 'data',
                    },
                ],
            })
            expect(result.success).toBe(false)
        })

        it('rejects disallowed mime types', () => {
            const result = SendChatMessageRequest.safeParse({
                content: 'Unsupported script file',
                files: [
                    {
                        name: 'script.sh',
                        mimeType: 'application/x-sh',
                        data: 'echo hello',
                    },
                ],
            })
            expect(result.success).toBe(false)
        })
    })

    describe('PersistedChatPartSchema discriminated union', () => {
        it('validates text and reasoning parts', () => {
            const message = PersistedChatMessageSchema.parse({
                role: PersistedChatRole.USER,
                parts: [
                    { type: PersistedChatPartType.TEXT, text: 'Hello AI assistant' },
                    { type: PersistedChatPartType.REASONING, text: 'Evaluating system prompt context' },
                ],
            })
            expect(message.role).toBe('user')
            expect(message.parts.length).toBe(2)
        })

        it('validates tool call parts with completion and error statuses', () => {
            const completedToolMessage = PersistedChatMessageSchema.parse({
                role: PersistedChatRole.ASSISTANT,
                parts: [
                    {
                        type: PersistedChatPartType.TOOL_CALL,
                        toolCallId: 'call_123',
                        toolName: 'ap_select_project',
                        input: { projectId: 'proj_abc' },
                        status: PersistedToolCallStatus.COMPLETED,
                    },
                ],
            })
            expect(completedToolMessage.parts[0].type).toBe('tool-call')

            const failedToolMessage = PersistedChatMessageSchema.parse({
                role: PersistedChatRole.ASSISTANT,
                parts: [
                    {
                        type: PersistedChatPartType.TOOL_CALL,
                        toolCallId: 'call_456',
                        toolName: 'ap_execute_action',
                        input: { piece: 'slack' },
                        status: PersistedToolCallStatus.ERROR,
                        errorText: 'Connection required',
                    },
                ],
            })
            expect(failedToolMessage.parts[0].type).toBe('tool-call')
        })

        it('validates action receipts, build plans, and media parts', () => {
            const message = PersistedChatMessageSchema.parse({
                role: PersistedChatRole.ASSISTANT,
                parts: [
                    {
                        type: PersistedChatPartType.ACTION_RECEIPT,
                        toolCallId: 'call_789',
                        actionDisplayName: 'Send Slack Message',
                        pieceName: '@inboxfm-connect/piece-slack',
                        status: 'success',
                        timestamp: '2026-10-04T12:00:00.000Z',
                    },
                    {
                        type: PersistedChatPartType.BUILD_PLAN,
                        buildId: 'bld_101',
                        data: { steps: 3 },
                    },
                    {
                        type: PersistedChatPartType.SOURCE_URL,
                        sourceId: 'src_url_1',
                        url: 'https://docs.activepieces.com',
                        title: 'Official Documentation',
                    },
                    {
                        type: PersistedChatPartType.IMAGE,
                        toolCallId: 'call_img',
                        fileId: 'fil_01',
                        url: 'https://cdn.example.com/generated.png',
                        mediaType: 'image/png',
                        timestamp: '2026-10-04T12:05:00.000Z',
                    },
                    {
                        type: PersistedChatPartType.FILE,
                        toolCallId: 'call_fil',
                        fileId: 'fil_02',
                        url: 'https://cdn.example.com/export.csv',
                        mediaType: 'text/csv',
                        fileName: 'export.csv',
                        byteSize: 1024,
                        timestamp: '2026-10-04T12:06:00.000Z',
                    },
                ],
            })
            expect(message.parts.length).toBe(5)
        })

        it('rejects message containing unknown part type', () => {
            const result = PersistedChatMessageSchema.safeParse({
                role: PersistedChatRole.ASSISTANT,
                parts: [
                    { type: 'unsupported-part-type', content: 'test' },
                ],
            })
            expect(result.success).toBe(false)
        })
    })

    describe('ChatConversation entity schema', () => {
        it('assigns expected defaults for status, messages, and nullable fields', () => {
            const now = new Date().toISOString()
            const conversation = ChatConversation.parse({
                id: 'chat_conv_01',
                created: now,
                updated: now,
                platformId: 'plt_01',
                projectId: null,
                userId: 'usr_01',
                title: null,
                modelName: null,
                activeRunId: null,
                summary: null,
                summarizedUpToIndex: null,
            })
            expect(conversation.status).toBe(ChatConversationStatus.IDLE)
            expect(conversation.messages).toEqual([])
            expect(conversation.uiMessages).toBeNull()
            expect(conversation.title).toBeNull()
        })
    })

    describe('Request payloads and refine validation guards', () => {
        it('validates CreateChatConversationRequest and UpdateChatConversationRequest', () => {
            const createReq = CreateChatConversationRequest.parse({
                title: 'Customer support workflow',
                modelName: 'gpt-4o',
            })
            expect(createReq.title).toBe('Customer support workflow')

            const updateReq = UpdateChatConversationRequest.parse({
                title: 'Updated title',
            })
            expect(updateReq.title).toBe('Updated title')
        })

        it('requires content or files in SendChatMessageRequest', () => {
            const validWithContentOnly = SendChatMessageRequest.parse({ content: 'Just text' })
            expect(validWithContentOnly.content).toBe('Just text')

            const validWithFilesOnly = SendChatMessageRequest.parse({
                content: '',
                files: [{ name: 'doc.txt', mimeType: 'text/plain', data: 'data' }],
            })
            expect(validWithFilesOnly.files?.length).toBe(1)

            const invalidEmpty = SendChatMessageRequest.safeParse({ content: '' })
            expect(invalidEmpty.success).toBe(false)
        })

        it('enforces maximum character length of 51200 on SendChatMessageRequest content', () => {
            const oversized = 'a'.repeat(51201)
            const result = SendChatMessageRequest.safeParse({ content: oversized })
            expect(result.success).toBe(false)
        })

        it('validates SimulateChatRequest single or multi-message payloads', () => {
            const single = SimulateChatRequest.parse({
                platformId: 'plt_01',
                userMessage: 'Test prompt',
            })
            expect(single.userMessage).toBe('Test prompt')

            const multi = SimulateChatRequest.parse({
                platformId: 'plt_01',
                userMessages: ['Prompt one', 'Prompt two'],
            })
            expect(multi.userMessages?.length).toBe(2)

            const neither = SimulateChatRequest.safeParse({ platformId: 'plt_01' })
            expect(neither.success).toBe(false)
        })
    })

    describe('chatPersistenceUtils.unwrapToolOutput helper', () => {
        it('unwraps JSON envelope objects containing { type: "json", value }', () => {
            const input = { type: 'json', value: { success: true, count: 5 } }
            const unwrapped = chatPersistenceUtils.unwrapToolOutput(input)
            expect(unwrapped).toEqual({ success: true, count: 5 })
        })

        it('leaves primitives, null, and non-json tool outputs unchanged', () => {
            expect(chatPersistenceUtils.unwrapToolOutput(null)).toBeNull()
            expect(chatPersistenceUtils.unwrapToolOutput(undefined)).toBeUndefined()
            expect(chatPersistenceUtils.unwrapToolOutput('plain string output')).toBe('plain string output')
            expect(chatPersistenceUtils.unwrapToolOutput({ other: 'value' })).toEqual({ other: 'value' })
        })
    })
})
