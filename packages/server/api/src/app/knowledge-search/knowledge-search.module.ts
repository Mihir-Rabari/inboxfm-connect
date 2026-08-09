import { FastifyPluginAsync } from 'fastify'
import { knowledgeSearchController } from './knowledge-search.controller'

export const knowledgeSearchModule: FastifyPluginAsync = async (app) => {
    await app.register(knowledgeSearchController, { prefix: '/v1/knowledge-search' })
}
