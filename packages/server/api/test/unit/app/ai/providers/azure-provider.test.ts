import { AIProviderModelType } from '@inboxfm-connect/shared'
import { describe, expect, it, vi } from 'vitest'

const { mockAxiosRequest } = vi.hoisted(() => ({ mockAxiosRequest: vi.fn() }))

vi.mock('@inboxfm-connect/server-utils', () => ({
    safeHttp: { axios: { request: mockAxiosRequest } },
}))

import { azureProvider } from '../../../../../src/app/ai/providers/azure-provider'

describe('azureProvider.listModels', () => {
    it('routes through the SSRF-filtered transport with the resource endpoint', async () => {
        mockAxiosRequest.mockResolvedValue({
            data: { data: [{ name: 'gpt-4o' }] },
        })

        const models = await azureProvider.listModels(
            { apiKey: 'test-key' },
            { resourceName: 'my-resource-123' },
        )

        expect(mockAxiosRequest).toHaveBeenCalledWith(expect.objectContaining({
            url: expect.stringContaining('https://my-resource-123.openai.azure.com/openai/deployments'),
        }))
        expect(models).toEqual([{ id: 'gpt-4o', name: 'gpt-4o', type: AIProviderModelType.TEXT }])
    })
})
