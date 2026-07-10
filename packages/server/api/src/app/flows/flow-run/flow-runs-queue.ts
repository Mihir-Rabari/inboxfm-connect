import { FastifyBaseLogger } from 'fastify'
export type RunsMetadataUpsertData = Record<string, unknown>

export const runsMetadataQueue = (log: FastifyBaseLogger) => ({
    async init(): Promise<void> {
        // No-op: queues are eliminated in headless platform
    },
    async add(params: RunsMetadataUpsertData): Promise<void> {
        // No-op: queues are eliminated in headless platform
    },
    async close(): Promise<void> {
        // No-op: queues are eliminated in headless platform
    },
})
