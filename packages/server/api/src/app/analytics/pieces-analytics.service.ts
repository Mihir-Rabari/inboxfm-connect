import { FastifyBaseLogger } from 'fastify'

export const piecesAnalyticsService = (log: FastifyBaseLogger) => ({
    async init(): Promise<void> {
        // No-op: Flow analytics is deprecated in headless platform.
    },
})