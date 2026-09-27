import { safeHttp } from '@inboxfm-connect/server-utils'
import { AIProviderModel, AIProviderModelType, OpenRouterProviderAuthConfig, OpenRouterProviderConfig } from '@inboxfm-connect/shared'
import { FastifyBaseLogger } from 'fastify'
import { AIProviderStrategy } from './ai-provider'

export const openRouterProvider: AIProviderStrategy<OpenRouterProviderAuthConfig, OpenRouterProviderConfig> = {
    name: 'OpenRouter',
    async validateConnection(authConfig: OpenRouterProviderAuthConfig, _config: OpenRouterProviderConfig, _log: FastifyBaseLogger): Promise<void> {
        await safeHttp.axios.request({
            url: 'https://openrouter.ai/api/v1/auth/key',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authConfig.apiKey}`,
                'Content-Type': 'application/json',
            },
        })
    },
    async listModels(_authConfig: OpenRouterProviderAuthConfig, _config: OpenRouterProviderConfig): Promise<AIProviderModel[]> {
        const res = await safeHttp.axios.request<{ data: OpenRouterModel[] }>({
            url: 'https://openrouter.ai/api/v1/models',
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        })

        const { data } = res.data

        return data.map((model: OpenRouterModel) => ({
            id: model.id,
            name: model.name,
            type: model.architecture.output_modalities.includes('image') ? AIProviderModelType.IMAGE : AIProviderModelType.TEXT,
        }))
    },
}

type OpenRouterModel = {
    id: string
    name: string
    architecture: {
        output_modalities: string[]
    }
}