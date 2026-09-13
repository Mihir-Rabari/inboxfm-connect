import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { connectSessionAuthenticatedController, connectSessionPublicController } from './connect-session.controller'

// Original, from-scratch implementation — no dependency on packages/server/api/src/app/ee/.
// Available on every edition; this is core to the Connect platform, not a paid add-on.
export const connectSessionModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(connectSessionAuthenticatedController, { prefix: '/v1/connect-sessions' })
    await app.register(connectSessionPublicController, { prefix: '/v1/connect-sessions' })
}
