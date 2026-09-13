import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { platformMustHaveFeatureEnabled } from '../ee/authentication/ee-authorization'
import { connectSessionAuthenticatedController, connectSessionPublicController } from './connect-session.controller'

export const connectSessionModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(async (authenticated) => {
        authenticated.addHook('preHandler', platformMustHaveFeatureEnabled((platform) => platform.plan.apiKeysEnabled))
        await authenticated.register(connectSessionAuthenticatedController)
    }, { prefix: '/v1/connect-sessions' })

    await app.register(connectSessionPublicController, { prefix: '/v1/connect-sessions' })
}
