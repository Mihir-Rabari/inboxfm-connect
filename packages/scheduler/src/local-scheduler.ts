import cron from 'node-cron'
import { Scheduler } from './types'

const activeTasks = new Map<string, cron.ScheduledTask | NodeJS.Timeout>()

const localSchedulerImpl: Scheduler = {
    async once({ name, delayMs, fn }): Promise<string> {
        const id = `${name}-${Math.random().toString(36).substring(2, 9)}`
        const timeout = setTimeout(() => {
            activeTasks.delete(id)
            try {
                const res = fn()
                if (res instanceof Promise) {
                    res.catch(() => {})
                }
            } catch {
                // Ignore execution errors to remain standalone
            }
        }, delayMs)
        activeTasks.set(id, timeout)
        return id
    },

    async every({ name, intervalMs, fn }): Promise<string> {
        const id = `${name}-${Math.random().toString(36).substring(2, 9)}`
        const interval = setInterval(() => {
            try {
                const res = fn()
                if (res instanceof Promise) {
                    res.catch(() => {})
                }
            } catch {
                // Ignore execution errors to remain standalone
            }
        }, intervalMs)
        activeTasks.set(id, interval)
        return id
    },

    async cron({ name, cronExpression, fn }): Promise<string> {
        const id = name
        await this.cancel(id)
        const task = cron.schedule(cronExpression, () => {
            try {
                const res = fn()
                if (res instanceof Promise) {
                    res.catch(() => {})
                }
            } catch {
                // Ignore execution errors to remain standalone
            }
        })
        activeTasks.set(id, task)
        return id
    },

    async cancel(id: string): Promise<void> {
        const task = activeTasks.get(id)
        if (task === undefined) {
            return
        }
        if ('stop' in task) {
            task.stop()
        } else {
            clearTimeout(task)
            clearInterval(task)
        }
        activeTasks.delete(id)
    },

    async shutdown(): Promise<void> {
        for (const task of activeTasks.values()) {
            if ('stop' in task) {
                task.stop()
            } else {
                clearTimeout(task)
                clearInterval(task)
            }
        }
        activeTasks.clear()
    }
}

export const LocalScheduler = localSchedulerImpl
