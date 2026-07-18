import { PlatformId, sanitizeObjectForPostgresql } from '@inboxfm-connect/core-utils'
import { flowPieceUtil, FlowVersionTemplate } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'

export const templateValidator = {
    async validateAndPrepare({ flows, platformId, log }: ValidateParams): Promise<PreparedTemplate> {
        if (!flows || flows.length === 0) {
            return {
                flows: [],
                pieces: [],
            }
        }

        const sanitizedFlows = flows.map((flow) => sanitizeObjectForPostgresql(flow))
        const pieces = Array.from(new Set(sanitizedFlows.map((flow) => flowPieceUtil.getUsedPieces(flow.trigger)).flat()))

        return {
            flows: sanitizedFlows,
            pieces,
        }
    },
}

type PreparedTemplate = {
    flows: FlowVersionTemplate[]
    pieces: string[]
}

type ValidateParams = {
    flows: FlowVersionTemplate[] | undefined
    platformId?: PlatformId
    log: FastifyBaseLogger
}