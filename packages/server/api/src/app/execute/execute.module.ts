import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { executeController } from './execute.controller'

export const executeModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(executeController, { prefix: '/v1/execute' })
}
