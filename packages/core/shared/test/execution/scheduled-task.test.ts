import { describe, expect, it } from 'vitest'
import { ScheduledTask, ScheduledTaskStatus } from '../../src/lib/execution/scheduled-task'

describe('ScheduledTask Model & Contract', () => {
    it('validates a valid ScheduledTask', () => {
        const task = {
            id: 'st_12345678901234567',
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            projectId: 'proj_12345678901234567',
            platformId: 'plat_12345678901234567',
            prompt: 'Every day at 9 AM, generate sales summary',
            cronExpression: '0 9 * * *',
            timezone: 'UTC',
            status: ScheduledTaskStatus.ENABLED,
            lastRunAt: null,
            nextRunAt: null,
        }

        const parsed = ScheduledTask.parse(task)
        expect(parsed.id).toBe('st_12345678901234567')
        expect(parsed.status).toBe(ScheduledTaskStatus.ENABLED)
        expect(parsed.cronExpression).toBe('0 9 * * *')
    })

    it('rejects forbidden workflow graph fields from ScheduledTask contract', () => {
        const forbiddenFields = [
            'flowId',
            'flowVersionId',
            'flowRunId',
            'stepRunId',
            'stepName',
            'nodeId',
            'routerPath',
            'loopIteration',
        ]

        const taskKeys = Object.keys(ScheduledTask.shape)
        for (const forbidden of forbiddenFields) {
            expect(taskKeys).not.toContain(forbidden)
        }
    })
})
