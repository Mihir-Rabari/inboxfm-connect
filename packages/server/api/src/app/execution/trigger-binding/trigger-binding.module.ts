import { FastifyPluginAsync } from 'fastify'
import { triggerBindingController } from './trigger-binding.controller'

export const triggerBindingModule: FastifyPluginAsync = async (app) => {
    await app.register(triggerBindingController, { prefix: '/v1/trigger-bindings' })
}
