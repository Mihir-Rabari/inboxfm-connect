import { ApiClientError } from '@/lib/api/client'

const STATUS_MESSAGES: Record<number, string> = {
  401: 'Your session has expired. Sign in again and retry.',
  403: 'You do not have permission to manage MCP settings in this project.',
  404: 'The MCP server for this project could not be found.',
  422: 'The request was rejected as invalid. Check the values and try again.',
  500: 'The server failed to complete the operation. Try again shortly.',
}

/**
 * Maps MCP API failures to safe messages. Server-provided messages pass through
 * because backend error responses never contain credential material.
 */
function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    if (error.message && error.statusCode >= 400 && error.statusCode !== 401 && error.statusCode !== 403 && error.statusCode !== 422) {
      return error.message
    }
    return STATUS_MESSAGES[error.statusCode] ?? fallback
  }
  if (error instanceof Error && error.message === 'Failed to fetch') {
    return 'Could not reach the InboxFM Connect API. Check your network connection and try again.'
  }
  return fallback
}

export const mcpErrors = {
  describe,
}
