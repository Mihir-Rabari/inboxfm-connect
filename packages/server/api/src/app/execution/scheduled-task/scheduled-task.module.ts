import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { scheduledTaskController } from './scheduled-task.controller'

export const scheduledTaskModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(scheduledTaskController, { prefix: '/v1/scheduled-tasks' })
}
