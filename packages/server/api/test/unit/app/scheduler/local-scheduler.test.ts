import { LocalScheduler } from '@inboxfm-connect/scheduler'
import { describe, expect, it, vi } from 'vitest'

describe('LocalScheduler Error Handling & Failure Observability', () => {
    it('invokes onError callback when a scheduled task throws an exception', async () => {
        const errorMock = vi.fn()
        const taskId = await LocalScheduler.once({
            name: 'test-error-job',
            delayMs: 10,
            fn: () => {
                throw new Error('Test job execution failed')
            },
            onError: errorMock,
        })

        await new Promise((r) => setTimeout(r, 50))

        expect(errorMock).toHaveBeenCalledTimes(1)
        expect(errorMock.mock.calls[0][0]).toMatchObject({
            id: taskId,
            name: 'test-error-job',
        })
        expect(errorMock.mock.calls[0][0].error).toBeInstanceOf(Error)
        expect(errorMock.mock.calls[0][0].error.message).toBe('Test job execution failed')
    })

    it('invokes onError callback when an async task rejects', async () => {
        const errorMock = vi.fn()
        const taskId = await LocalScheduler.once({
            name: 'test-async-error-job',
            delayMs: 10,
            fn: async () => {
                throw new Error('Async promise rejection')
            },
            onError: errorMock,
        })

        await new Promise((r) => setTimeout(r, 50))

        expect(errorMock).toHaveBeenCalledTimes(1)
        expect(errorMock.mock.calls[0][0]).toMatchObject({
            id: taskId,
            name: 'test-async-error-job',
        })
        expect(errorMock.mock.calls[0][0].error.message).toBe('Async promise rejection')
    })

    it('cancels scheduled tasks cleanly', async () => {
        const fnMock = vi.fn()
        const taskId = await LocalScheduler.once({
            name: 'test-cancel-job',
            delayMs: 50,
            fn: fnMock,
        })

        await LocalScheduler.cancel(taskId)
        await new Promise((r) => setTimeout(r, 70))

        expect(fnMock).not.toHaveBeenCalled()
    })
})
