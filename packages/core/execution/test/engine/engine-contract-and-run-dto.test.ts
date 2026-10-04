import { apId } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import { StepRunResponse } from '../../src/lib/engine/step-run-response'
import {
    CountFlowRunsByStatusRequest,
    CountFlowRunsByStatusResponse,
    FlowRunCountByStatus,
    ListFlowRunsRequestQuery,
} from '../../src/lib/flow-run/dto/list-flow-runs-request'
import { FlowRunStatus } from '../../src/lib/flow-run/execution/flow-execution'
import { FolderDto } from '../../src/lib/flows/folders/list-folders-response'

describe('Engine Run DTOs, Step Responses, and Folder Contracts (#141)', () => {
    describe('ListFlowRunsRequestQuery schema', () => {
        it('parses minimal query with projectId', () => {
            const query = ListFlowRunsRequestQuery.parse({
                projectId: apId(),
            })
            expect(query.projectId).toBeDefined()
            expect(query.status).toBeUndefined()
            expect(query.limit).toBeUndefined()
        })

        it('parses query with multiple status filters and pagination params', () => {
            const query = ListFlowRunsRequestQuery.parse({
                projectId: apId(),
                status: [FlowRunStatus.SUCCEEDED, FlowRunStatus.FAILED],
                limit: '25',
                cursor: 'cursor-abc',
                createdAfter: '2026-10-01T00:00:00.000Z',
                createdBefore: '2026-10-04T00:00:00.000Z',
                includeArchived: 'true',
            })
            expect(query.status).toEqual([FlowRunStatus.SUCCEEDED, FlowRunStatus.FAILED])
            expect(query.limit).toBe(25)
            expect(query.cursor).toBe('cursor-abc')
            expect(query.includeArchived).toBe(true)
        })

        it('parses failed step filter fields', () => {
            const query = ListFlowRunsRequestQuery.parse({
                projectId: apId(),
                failedStepName: 'step_send_email',
                failedStepMessage: 'Connection timed out',
            })
            expect(query.failedStepName).toBe('step_send_email')
            expect(query.failedStepMessage).toBe('Connection timed out')
        })

        it('parses flowId and flowRunIds array query filters', () => {
            const id1 = apId()
            const id2 = apId()
            const query = ListFlowRunsRequestQuery.parse({
                projectId: apId(),
                flowId: [id1],
                flowRunIds: [id1, id2],
            })
            expect(query.flowId).toEqual([id1])
            expect(query.flowRunIds).toEqual([id1, id2])
        })
    })

    describe('CountFlowRunsByStatusRequest and Response schemas', () => {
        it('parses count request by project', () => {
            const req = CountFlowRunsByStatusRequest.parse({
                projectId: apId(),
                createdAfter: '2026-10-01T00:00:00.000Z',
            })
            expect(req.projectId).toBeDefined()
            expect(req.createdAfter).toBe('2026-10-01T00:00:00.000Z')
        })

        it('parses FlowRunCountByStatus and CountFlowRunsByStatusResponse', () => {
            const item1 = FlowRunCountByStatus.parse({
                status: FlowRunStatus.SUCCEEDED,
                count: 350,
            })
            const item2 = FlowRunCountByStatus.parse({
                status: FlowRunStatus.FAILED,
                count: 12,
            })
            const response = CountFlowRunsByStatusResponse.parse({
                data: [item1, item2],
            })
            expect(response.data).toHaveLength(2)
            expect(response.data[0]?.status).toBe(FlowRunStatus.SUCCEEDED)
            expect(response.data[0]?.count).toBe(350)
            expect(response.data[1]?.status).toBe(FlowRunStatus.FAILED)
            expect(response.data[1]?.count).toBe(12)
        })
    })

    describe('StepRunResponse schema', () => {
        it('parses successful step run response', () => {
            const res = StepRunResponse.parse({
                runId: apId(),
                success: true,
                input: { recipient: 'user@example.com', subject: 'Hello' },
                output: { messageId: 'msg-999', status: 'sent' },
                standardError: '',
                standardOutput: 'Message dispatched successfully\n',
            })
            expect(res.success).toBe(true)
            expect(res.standardError).toBe('')
            expect(res.standardOutput).toContain('dispatched successfully')
        })

        it('parses failed step run response with standardError diagnostics', () => {
            const res = StepRunResponse.parse({
                runId: apId(),
                success: false,
                input: { url: 'https://api.example.com/data' },
                output: null,
                standardError: 'HTTP 500 Internal Server Error: Gateway timeout',
                standardOutput: '',
            })
            expect(res.success).toBe(false)
            expect(res.standardError).toContain('HTTP 500')
        })
    })

    describe('FolderDto model structure', () => {
        it('correctly types folder entity with flow and table counts', () => {
            const folderDto: FolderDto = {
                id: apId(),
                created: '2026-10-01T00:00:00.000Z',
                updated: '2026-10-01T00:00:00.000Z',
                projectId: apId(),
                displayName: 'Customer Onboarding',
                displayOrder: 1,
                externalId: null,
                numberOfFlows: 8,
                numberOfTables: 3,
            }
            expect(folderDto.displayName).toBe('Customer Onboarding')
            expect(folderDto.displayOrder).toBe(1)
            expect(folderDto.numberOfFlows).toBe(8)
            expect(folderDto.numberOfTables).toBe(3)
        })
    })
})
