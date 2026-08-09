export interface Scheduler {
    once(params: { name: string, delayMs: number, fn: () => Promise<void> | void, onError?: (ctx: SchedulerTaskErrorContext) => void }): Promise<string>
    every(params: { name: string, intervalMs: number, fn: () => Promise<void> | void, onError?: (ctx: SchedulerTaskErrorContext) => void }): Promise<string>
    cron(params: { name: string, cronExpression: string, fn: () => Promise<void> | void, onError?: (ctx: SchedulerTaskErrorContext) => void }): Promise<string>
    cancel(id: string): Promise<void>
    shutdown(): Promise<void>
}

export type SchedulerTaskErrorContext = {
    id: string
    name: string
    error: unknown
}
