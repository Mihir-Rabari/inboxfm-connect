import { ApiClientError } from '@/lib/api/client'

const STATUS_MESSAGES: Record<number, string> = {
  400: 'The request was rejected. Check the entered values and try again.',
  401: 'Your session has expired. Please sign in again.',
  402: 'This action requires an upgraded plan.',
  403: 'You do not have permission to manage connections in this project.',
  404: 'This integration or connection could not be found.',
}

/**
 * Maps failures to safe, useful messages. Server-provided messages are passed
 * through because they never contain credential values (credentials are sent,
 * never echoed back).
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

export const connectionErrors = {
  describe,
}
