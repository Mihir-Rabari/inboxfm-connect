import { AIProviderName } from '@inboxfm-connect/core-utils'
import { describe, expect, it } from 'vitest'
import {
    ACTIVEPIECES_CHAT_TIERS,
    AIErrorResponse,
    AIProviderModelType,
    aiProviderUtils,
    ALLOWED_CHAT_MODELS_BY_PROVIDER,
    CreateAIProviderRequest,
    DEFAULT_CHAT_TIER_ID,
    getEffectiveProviderAndModel,
    GetProviderConfigResponse,
    ProviderModelConfig,
    splitCloudflareGatewayModelId,
    UpdateAIProviderRequest,
} from '../../../src/lib/management/ai-providers'

describe('AI Providers Contracts and Capabilities (#141)', () => {
    describe('Constants and Enums', () => {
        it('defines valid AIProviderModelType enum members', () => {
            expect(AIProviderModelType.TEXT).toBe('text')
            expect(AIProviderModelType.IMAGE).toBe('image')
        })

        it('defines default chat tier and tier properties', () => {
            expect(DEFAULT_CHAT_TIER_ID).toBe('smart')
            expect(ACTIVEPIECES_CHAT_TIERS).toHaveLength(3)
            const smartTier = ACTIVEPIECES_CHAT_TIERS.find((t) => t.id === 'smart')
            expect(smartTier?.modelId).toBe('anthropic/claude-sonnet-4.6')
            expect(smartTier?.thinkingBudget).toBe(10000)
        })

        it('provides allowed chat models for supported providers', () => {
            expect(ALLOWED_CHAT_MODELS_BY_PROVIDER[AIProviderName.OPENAI]).toBeDefined()
            expect(ALLOWED_CHAT_MODELS_BY_PROVIDER[AIProviderName.ANTHROPIC]).toBeDefined()
            expect(ALLOWED_CHAT_MODELS_BY_PROVIDER[AIProviderName.GOOGLE]).toBeDefined()
            expect(ALLOWED_CHAT_MODELS_BY_PROVIDER[AIProviderName.ACTIVEPIECES]).toBeDefined()
        })
    })

    describe('splitCloudflareGatewayModelId utility', () => {
        it('splits standard provider/model identifiers', () => {
            const result = splitCloudflareGatewayModelId('openai/gpt-4o')
            expect(result).toEqual({
                provider: 'openai',
                model: 'gpt-4o',
                publisher: undefined,
            })
        })

        it('splits Google Vertex AI identifiers with publisher segment', () => {
            const result = splitCloudflareGatewayModelId('google-vertex-ai/google/gemini-2.5-pro')
            expect(result).toEqual({
                provider: 'google-vertex-ai',
                publisher: 'google',
                model: 'gemini-2.5-pro',
            })
        })

        it('handles malformed Google Vertex AI identifier missing model part', () => {
            const result = splitCloudflareGatewayModelId('google-vertex-ai/google')
            expect(result.provider).toBeUndefined()
            expect(result.model).toBe('google-vertex-ai/google')
        })

        it('handles model identifier without slash delimiter', () => {
            const result = splitCloudflareGatewayModelId('claude-sonnet-4-6')
            expect(result).toEqual({
                provider: undefined,
                model: 'claude-sonnet-4-6',
                publisher: undefined,
            })
        })
    })

    describe('getEffectiveProviderAndModel utility', () => {
        it('returns direct providers without modification', () => {
            const result = getEffectiveProviderAndModel({
                provider: AIProviderName.ANTHROPIC,
                model: 'claude-sonnet-4-6',
            })
            expect(result).toEqual({
                provider: AIProviderName.ANTHROPIC,
                model: 'claude-sonnet-4-6',
            })
        })

        it('resolves Cloudflare Gateway mapped submodels', () => {
            const openAiResult = getEffectiveProviderAndModel({
                provider: AIProviderName.CLOUDFLARE_GATEWAY,
                model: 'openai/gpt-4.1',
            })
            expect(openAiResult).toEqual({
                provider: AIProviderName.OPENAI,
                model: 'gpt-4.1',
            })

            const anthropicResult = getEffectiveProviderAndModel({
                provider: AIProviderName.CLOUDFLARE_GATEWAY,
                model: 'anthropic/claude-opus-4-7',
            })
            expect(anthropicResult).toEqual({
                provider: AIProviderName.ANTHROPIC,
                model: 'claude-opus-4-7',
            })

            const vertexResult = getEffectiveProviderAndModel({
                provider: AIProviderName.CLOUDFLARE_GATEWAY,
                model: 'google-vertex-ai/google/gemini-2.5-pro',
            })
            expect(vertexResult).toEqual({
                provider: AIProviderName.GOOGLE,
                model: 'gemini-2.5-pro',
            })
        })

        it('falls back to raw inputs when submodel prefix is unknown', () => {
            const unknownResult = getEffectiveProviderAndModel({
                provider: AIProviderName.CLOUDFLARE_GATEWAY,
                model: 'cohere/command-r',
            })
            expect(unknownResult).toEqual({
                provider: AIProviderName.CLOUDFLARE_GATEWAY,
                model: 'cohere/command-r',
            })
        })

        it('handles undefined provider or model gracefully', () => {
            expect(getEffectiveProviderAndModel({ provider: undefined, model: 'gpt-4' })).toEqual({
                provider: undefined,
                model: 'gpt-4',
            })
            expect(getEffectiveProviderAndModel({ provider: AIProviderName.OPENAI, model: undefined })).toEqual({
                provider: AIProviderName.OPENAI,
                model: undefined,
            })
        })
    })

    describe('aiProviderUtils.getMaxContextTokens', () => {
        it('returns provider-specific token capacities', () => {
            expect(aiProviderUtils.getMaxContextTokens({ provider: AIProviderName.OPENAI })).toBe(128000)
            expect(aiProviderUtils.getMaxContextTokens({ provider: AIProviderName.ANTHROPIC })).toBe(200000)
            expect(aiProviderUtils.getMaxContextTokens({ provider: AIProviderName.GOOGLE })).toBe(1048576)
            expect(aiProviderUtils.getMaxContextTokens({ provider: AIProviderName.BEDROCK })).toBe(200000)
            expect(aiProviderUtils.getMaxContextTokens({ provider: AIProviderName.ACTIVEPIECES })).toBe(200000)
            expect(aiProviderUtils.getMaxContextTokens({ provider: undefined })).toBe(128000)
        })
    })

    describe('ProviderModelConfig schema', () => {
        it('parses valid model configuration', () => {
            const parsed = ProviderModelConfig.parse({
                modelId: 'custom-gpt-model',
                modelName: 'Custom Fine-Tuned Model',
                modelType: AIProviderModelType.TEXT,
            })
            expect(parsed.modelId).toBe('custom-gpt-model')
            expect(parsed.modelType).toBe('text')
        })
    })

    describe('CreateAIProviderRequest discriminated union', () => {
        it('parses valid OpenAI provider configuration', () => {
            const parsed = CreateAIProviderRequest.parse({
                displayName: 'My OpenAI Account',
                provider: AIProviderName.OPENAI,
                config: {},
                auth: { apiKey: 'test-api-key' },
            })
            expect(parsed.provider).toBe('openai')
            expect(parsed.auth.apiKey).toBe('test-api-key')
        })

        it('parses valid Bedrock provider configuration', () => {
            const parsed = CreateAIProviderRequest.parse({
                displayName: 'AWS Bedrock Corp',
                provider: AIProviderName.BEDROCK,
                config: { region: 'us-east-1' },
                auth: {
                    accessKeyId: 'test-access-key-id',
                    secretAccessKey: 'test-secret-access-key',
                },
            })
            expect(parsed.provider).toBe('bedrock')
            expect(parsed.config.region).toBe('us-east-1')
        })

        it('parses valid Azure OpenAI provider configuration', () => {
            const parsed = CreateAIProviderRequest.parse({
                displayName: 'Enterprise Azure AI',
                provider: AIProviderName.AZURE,
                config: {
                    resourceName: 'my-azure-resource',
                    apiVersion: '2024-10-21',
                },
                auth: { apiKey: 'azure-secret-key-123' },
            })
            expect(parsed.config.resourceName).toBe('my-azure-resource')
        })

        it('rejects Azure provider with invalid resourceName characters', () => {
            const result = CreateAIProviderRequest.safeParse({
                displayName: 'Enterprise Azure AI',
                provider: AIProviderName.AZURE,
                config: {
                    resourceName: '-invalid-name-',
                },
                auth: { apiKey: 'azure-key' },
            })
            expect(result.success).toBe(false)
        })

        it('parses valid Cloudflare Gateway provider configuration', () => {
            const parsed = CreateAIProviderRequest.parse({
                displayName: 'Cloudflare AI Gateway',
                provider: AIProviderName.CLOUDFLARE_GATEWAY,
                config: {
                    accountId: 'cf_acc_123',
                    gatewayId: 'cf_gw_456',
                    models: [
                        {
                            modelId: 'openai/gpt-4o',
                            modelName: 'GPT 4o via Cloudflare',
                            modelType: AIProviderModelType.TEXT,
                        },
                    ],
                },
                auth: { apiKey: 'cf-api-token' },
            })
            expect(parsed.config.gatewayId).toBe('cf_gw_456')
            expect(parsed.config.models).toHaveLength(1)
        })

        it('parses valid OpenAI-Compatible Custom provider configuration', () => {
            const parsed = CreateAIProviderRequest.parse({
                displayName: 'Local vLLM Server',
                provider: AIProviderName.CUSTOM,
                config: {
                    apiKeyHeader: 'Authorization',
                    baseUrl: 'https://vllm.internal.corp/v1',
                    models: [
                        {
                            modelId: 'llama-3.1-70b',
                            modelName: 'Llama 3.1 70B Instruct',
                            modelType: AIProviderModelType.TEXT,
                        },
                    ],
                    defaultHeaders: {
                        'X-Custom-Client': 'Inboxfm-Connect',
                    },
                },
                auth: { apiKey: 'vllm-token' },
            })
            expect(parsed.provider).toBe('custom')
            expect(parsed.config.apiKeyHeader).toBe('Authorization')
        })
    })

    describe('UpdateAIProviderRequest schema', () => {
        it('validates partial provider updates', () => {
            const parsed = UpdateAIProviderRequest.parse({
                displayName: 'Renamed Provider',
                enabledForChat: true,
            })
            expect(parsed.displayName).toBe('Renamed Provider')
            expect(parsed.enabledForChat).toBe(true)
        })

        it('rejects empty displayName', () => {
            const result = UpdateAIProviderRequest.safeParse({
                displayName: '',
            })
            expect(result.success).toBe(false)
        })
    })

    describe('GetProviderConfigResponse and AIErrorResponse schemas', () => {
        it('parses GetProviderConfigResponse', () => {
            const parsed = GetProviderConfigResponse.parse({
                provider: AIProviderName.OPENAI,
                config: {},
                auth: { apiKey: 'test-api-key' },
                platformId: 'plat-xyz',
            })
            expect(parsed.platformId).toBe('plat-xyz')
            expect(parsed.provider).toBe('openai')
        })

        it('parses standard AIErrorResponse', () => {
            const parsed = AIErrorResponse.parse({
                error: {
                    message: 'Rate limit exceeded: please slow down requests',
                    type: 'rate_limit_error',
                    code: 'rate_limit',
                },
            })
            expect(parsed.error.code).toBe('rate_limit')
        })
    })
})
