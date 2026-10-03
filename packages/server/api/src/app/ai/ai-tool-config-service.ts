import { ActivepiecesError, apId, ErrorCode, isNil, PlatformId, spreadIfDefined } from '@inboxfm-connect/core-utils'
import { AiToolAuthConfig, AiToolCapability, AiToolConfigWithoutSensitiveData, CreateAiToolConfigRequest, GetEnabledAiToolsResponse, ResolvedAiTool, UpdateAiToolConfigRequest } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { repoFactory } from '../core/db/repo-factory'
import { encryptUtils } from '../helper/encryption'
import { AiToolConfigEntity, AiToolConfigSchema } from './ai-tool-config-entity'

const aiToolConfigRepo = repoFactory<AiToolConfigSchema>(AiToolConfigEntity)

export const aiToolConfigService = (_log: FastifyBaseLogger) => ({
    async list(platformId: PlatformId): Promise<AiToolConfigWithoutSensitiveData[]> {
        const configs = await aiToolConfigRepo().findBy({ platformId })
        return configs.map(toWithoutSensitiveData)
    },

    async upsert(platformId: PlatformId, request: CreateAiToolConfigRequest): Promise<void> {
        const encryptedAuth = await encryptUtils.encryptObject(request.auth)
        // Two concurrent first-time requests for the same capability both read no existing
        // row before either save lands, so both insert and the loser violates
        // idx_ai_tool_config_platform_capability, surfacing a raw driver error as a 500 on a
        // platform-admin route. Upserting on the unique index lets the loser update the row the
        // winner inserted instead.
        //
        // `orUpdate` gets an explicit column list rather than repo().upsert(), because TypeORM
        // 0.3.x derives the DO UPDATE set from the entity (all defined columns minus the conflict
        // paths), which includes the primary key - the loser would overwrite the winner's id and
        // the read-back would miss. Same fix as 9438507cb7 (project-member) and the oauth-app
        // upsert.
        await aiToolConfigRepo()
            .createQueryBuilder()
            .insert()
            .into(AiToolConfigEntity)
            .values({
                id: apId(),
                platformId,
                capability: request.capability,
                provider: request.provider,
                auth: encryptedAuth,
                // `config` is a nullable JSON column, and TypeORM types an insert value as
                // _QueryDeepPartialEntity, which rejects a bare JSON scalar or null. Passing
                // it as a bound parameter keeps the type check honest instead of casting.
                config: () => ':config',
                enabled: request.enabled ?? true,
            })
            .setParameter('config', JSON.stringify(request.config ?? null))
            .orUpdate(['provider', 'auth', 'config', 'enabled'], ['platformId', 'capability'])
            .execute()
    },

    async update(platformId: PlatformId, id: string, request: UpdateAiToolConfigRequest): Promise<void> {
        const config = await aiToolConfigRepo().findOneBy({ platformId, id })
        if (isNil(config)) {
            throw new ActivepiecesError({
                code: ErrorCode.ENTITY_NOT_FOUND,
                params: { entityId: id, entityType: 'AiToolConfig' },
            })
        }
        const encryptedAuth = !isNil(request.auth) ? await encryptUtils.encryptObject(request.auth) : undefined
        await aiToolConfigRepo().update(id, {
            ...spreadIfDefined('provider', request.provider),
            ...spreadIfDefined('auth', encryptedAuth),
            ...spreadIfDefined('config', request.config),
            ...spreadIfDefined('enabled', request.enabled),
        })
    },

    async delete(platformId: PlatformId, id: string): Promise<void> {
        await aiToolConfigRepo().delete({ platformId, id })
    },

    async getEnabledTools({ platformId }: { platformId: PlatformId }): Promise<GetEnabledAiToolsResponse> {
        const configs = await aiToolConfigRepo().findBy({ platformId, enabled: true })
        const result: GetEnabledAiToolsResponse = {}
        for (const config of configs) {
            const resolved = await toResolvedTool(config)
            if (isNil(resolved)) {
                continue
            }
            switch (config.capability) {
                case AiToolCapability.WEB_SEARCH:
                    result.webSearch = resolved
                    break
                case AiToolCapability.WEB_SCRAPING:
                    result.webScraping = resolved
                    break
                case AiToolCapability.IMAGE_GENERATION:
                    result.imageGeneration = resolved
                    break
            }
        }
        return result
    },
})

function toWithoutSensitiveData(config: AiToolConfigSchema): AiToolConfigWithoutSensitiveData {
    return {
        id: config.id,
        capability: config.capability,
        provider: config.provider,
        config: config.config,
        enabled: config.enabled,
        hasApiKey: !isNil(config.auth),
    }
}

async function toResolvedTool(config: AiToolConfigSchema): Promise<ResolvedAiTool | null> {
    const auth = await encryptUtils.decryptObject<AiToolAuthConfig>(config.auth)
    if (isNil(auth?.apiKey) || auth.apiKey === '') {
        return null
    }
    return {
        provider: config.provider,
        apiKey: auth.apiKey,
        ...spreadIfDefined('config', config.config ?? undefined),
    }
}
