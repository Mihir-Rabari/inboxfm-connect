import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { connectApiKeyController } from './connect-api-key.controller'

// Original, from-scratch implementation — no dependency on packages/server/api/src/app/ee/.
// Available on every edition; this is core to the Connect platform, not a paid add-on.
export const connectApiKeyModule: FastifyPluginAsyncZod = async (app) => {
    await app.register(connectApiKeyController, { prefix: '/v1/connect-api-keys' })
}
