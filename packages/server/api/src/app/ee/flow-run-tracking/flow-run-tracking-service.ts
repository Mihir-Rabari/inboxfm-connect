import { FastifyBaseLogger } from 'fastify'

export const flowRunTrackingService = (log: FastifyBaseLogger) => ({
    async reportAllPlatforms(): Promise<void> {
        // No-op: Flow run tracking is deprecated in headless platform.
    },
})
