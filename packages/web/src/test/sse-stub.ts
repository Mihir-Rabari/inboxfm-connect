import { ExecutionEvent } from '@/lib/api/types'

interface SseStreamHandle {
  stream: ReadableStream<Uint8Array>
  push: (chunk: string) => void
  pushEvent: (event: ExecutionEvent) => void
  close: () => void
  fail: (error: Error) => void
}

/**
 * Serves a fresh SSE stream per request.
 *
 * A ReadableStream can only be consumed once, so a reconnect must be handed a new
 * stream — this factory keeps every stream it opened so a test can assert reconnect
 * behaviour and drive the newest connection.
 */
export function createSseStreamFactory() {
  const encoder = new TextEncoder()
  const opened: SseStreamHandle[] = []

  function next(): ReadableStream<Uint8Array> {
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null
    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController
      },
    })
    const push = (chunk: string) => {
      try {
        controller?.enqueue(encoder.encode(chunk))
      }
      catch {
        // The consumer already went away; nothing to deliver.
      }
    }
    opened.push({
      stream,
      push,
      pushEvent: (event: ExecutionEvent) => push(`data: ${JSON.stringify(event)}\n\n`),
      close: () => {
        try {
          controller?.close()
        }
        catch {
          // Already closed.
        }
      },
      fail: (error: Error) => {
        try {
          controller?.error(error)
        }
        catch {
          // Already errored.
        }
      },
    })
    return stream
  }

  return {
    next,
    opened,
    latest: (): SseStreamHandle | undefined => opened[opened.length - 1],
  }
}
