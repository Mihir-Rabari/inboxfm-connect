import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { executionController } from './execution.controller'

export const executionModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(executionController, { prefix: '/v1/executions' })
}
