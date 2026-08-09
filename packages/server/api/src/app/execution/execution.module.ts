import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { executionController } from './execution.controller'
import { scheduledTaskModule } from './scheduled-task/scheduled-task.module'
import { triggerBindingModule } from './trigger-binding/trigger-binding.module'

export const executionModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(executionController, { prefix: '/v1/executions' })
    await app.register(triggerBindingModule)
    await app.register(scheduledTaskModule)
}

