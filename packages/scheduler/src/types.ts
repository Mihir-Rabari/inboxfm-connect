export interface Scheduler {
    once(params: { name: string, delayMs: number, fn: () => Promise<void> | void }): Promise<string>
    every(params: { name: string, intervalMs: number, fn: () => Promise<void> | void }): Promise<string>
    cron(params: { name: string, cronExpression: string, fn: () => Promise<void> | void }): Promise<string>
    cancel(id: string): Promise<void>
    shutdown(): Promise<void>
}
