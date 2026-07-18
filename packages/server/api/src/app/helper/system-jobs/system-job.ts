import { scheduler } from '@inboxfm-connect/scheduler'
import { apDayjs } from '@inboxfm-connect/server-utils'
import { FastifyBaseLogger } from 'fastify'
import { SystemJobSchedule } from './common'
import { systemJobHandlers } from './job-handlers'

const activeJobIds = new Map<string, string>()

const systemJobsScheduleImpl = (log: FastifyBaseLogger): SystemJobSchedule => ({
    async init(): Promise<void> {
        log.info('[systemJob#init] In-process scheduler initialized')
    },

    async startWorker(): Promise<void> {
        log.info('[systemJob#startWorker] In-process worker started')
    },

    async upsertJob({ job, schedule }): Promise<void> {
        log.info({ jobName: job.name, jobId: job.jobId }, '[systemJob#upsertJob] Upserting job via LocalScheduler')
        
        const jobHandler = systemJobHandlers.getJobHandler(job.name)
        const runTask = async () => {
            log.debug({ jobName: job.name, jobId: job.jobId }, '[systemJob#inProcessWorker] Executing job')
            try {
                await jobHandler(job.data)
            }
            catch (err) {
                log.error(err, `[systemJob#inProcessWorker] Job execution failed: ${job.name}`)
            }
        }

        if (schedule.type === 'repeated') {
            const taskId = await scheduler.cron({
                name: job.name,
                cronExpression: schedule.cron,
                fn: runTask,
            })
            activeJobIds.set(job.jobId, taskId)
        }
        else if (schedule.type === 'one-time') {
            const delayMs = schedule.date.diff(apDayjs(), 'milliseconds')
            const taskId = await scheduler.once({
                name: job.name,
                delayMs: Math.max(0, delayMs),
                fn: runTask,
            })
            activeJobIds.set(job.jobId, taskId)
        }
    },

    async getJob(jobId: string) {
        return {
            async updateData() {},
            async isFailed() {
                return false 
            },
            async retry() {},
        } as any
    },

    async close(): Promise<void> {
        log.info('[systemJob#close] Closing in-process scheduler')
        await scheduler.shutdown()
        activeJobIds.clear()
    },
})

export const systemJobsSchedule = systemJobsScheduleImpl
export const systemJobsQueue = null as any
