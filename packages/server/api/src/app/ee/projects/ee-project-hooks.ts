import { FastifyBaseLogger } from 'fastify'
import { ProjectHooks } from '../../project/project-hooks'

export const projectEnterpriseHooks = (_log: FastifyBaseLogger): ProjectHooks => ({
    async postCreate() {
        // no-op (alerts service removed)
    },
})
