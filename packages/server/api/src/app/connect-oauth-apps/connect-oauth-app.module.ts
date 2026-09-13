import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { connectOAuthAppController } from './connect-oauth-app.controller'

export const connectOAuthAppModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(connectOAuthAppController, { prefix: '/v1/connect-oauth-apps' })
}
