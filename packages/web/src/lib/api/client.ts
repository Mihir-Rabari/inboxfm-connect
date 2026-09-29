import { appRouter } from '@/app/router'
import { ApiClientError } from './api-client-error'

export class ApiClientError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly message: string,
    public readonly details?: unknown
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

interface RequestOptions extends RequestInit {
  params?: Record<string, unknown>
}

class ApiClient {
  private baseUrl = '/api/v1'
  private token: string | null = null
  private projectId: string | null = null

  constructor() {
    const storedToken = localStorage.getItem('ap-token')
    const storedProjectId = localStorage.getItem('ap-project-id')
    this.token = storedToken
    this.projectId = storedProjectId
  }

  setToken(token: string | null) {
    this.token = token
    if (typeof localStorage !== 'undefined') {
      if (token) {
        localStorage.setItem('ap-token', token)
      } else {
        localStorage.removeItem('ap-token')
      }
      // Dispatch event to notify listeners of token change
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'ap-token',
        oldValue: token === null ? localStorage.getItem('ap-token') : null,
        newValue: token,
        url: window.location.href
      }))
    }
  }

  getToken(): string | null {
    return this.token
  }

  setProjectId(projectId: string | null) {
    this.projectId = projectId
    if (typeof localStorage !== 'undefined') {
      if (projectId) {
        localStorage.setItem('ap-project-id', projectId)
      } else {
        localStorage.removeItem('ap-project-id')
      }
    }
  }

  getProjectId(): string | null {
    return this.projectId
  }

  private async request<T>(path: string, options: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`
    }

    // Merge user-provided headers with default ones
    const allHeaders = {
      ...headers,
      ...(options.headers ?? {}),
    }

    const response = await fetch(url, {
      ...options,
      headers: allHeaders,
      credentials: 'include',
    })

    // Handle 401 Unauthorized - clear token and redirect to login
    if (response.status === 401) {
      this.setToken(null)
      this.setProjectId(null)
      // Trigger auth state update via localStorage event (already handled in setToken)
      // The redirect will be handled by RequireAuth component when it detects unauthenticated state
      // We throw a specific error to prevent further processing
      throw new ApiClientError(401, 'Unauthorized', await response.json().catch(() => ({})))
    }

    if (!response.ok) {
      const errorMessage =
        (responseData as { message?: string })?.message ||
        `Request failed with status ${response.status}`
      throw new ApiClientError(response.status, errorMessage, responseData)
    }

    const responseData = await response.json()
    return responseData as T
  }

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' })
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body })
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PUT', body })
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'PATCH', body })
  }

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' })
  }
}

export const apiClient = new ApiClient()
