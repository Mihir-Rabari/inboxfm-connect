import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient, ApiClientError } from './client'

describe('ApiClient', () => {
  beforeEach(() => {
    localStorage.clear()
    apiClient.setToken(null)
    apiClient.setProjectId(null)
    vi.restoreAllMocks()
  })

  it('should initialize with null token and project', () => {
    expect(apiClient.getToken()).toBeNull()
    expect(apiClient.getProjectId()).toBeNull()
  })

  it('should store and retrieve auth token and project id', () => {
    apiClient.setToken('test_token_123')
    apiClient.setProjectId('proj_abc')

    expect(apiClient.getToken()).toBe('test_token_123')
    expect(apiClient.getProjectId()).toBe('proj_abc')
    expect(localStorage.getItem('ap-token')).toBe('test_token_123')
    expect(localStorage.getItem('ap-project-id')).toBe('proj_abc')
  })

  it('should throw ApiClientError on non-200 responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ message: 'Resource not found' }),
    })

    await expect(apiClient.get('/test')).rejects.toThrow(ApiClientError)
  })

  it('should return parsed JSON data on 200 responses', async () => {
    const mockData = { id: '123', status: 'ACTIVE' }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => mockData,
    })

    const result = await apiClient.get('/test')
    expect(result).toEqual(mockData)
  })
})
