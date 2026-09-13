import { ApiClientError } from '@/lib/api/client'

const STATUS_MESSAGES: Record<number, string> = {
  400: 'The request was rejected. Check the input values and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to execute tools in this project.',
  404: 'The integration, action or connection could not be found.',
  422: 'The input was rejected as invalid. Check the values and try again.',
  500: 'The server failed to execute this tool. Try again shortly.',
  504: 'The execution timed out before completing.',
}

/**
 * Maps execution failures to safe, useful messages following the same
 * conventions as connectionErrors: server-provided tool errors pass through
 * because they never contain credential material.
 */
function describe(error: unknown, fallback: string): string {
  if (error instanceof ApiClientError) {
    if (error.message && error.statusCode >= 400) {
      return error.message
    }
    return STATUS_MESSAGES[error.statusCode] ?? fallback
  }
  if (error instanceof Error && error.message === 'Failed to fetch') {
    return 'Could not reach the InboxFM Connect API. Check your network connection and try again.'
  }
  return fallback
}

export const executionErrors = {
  describe,
}
