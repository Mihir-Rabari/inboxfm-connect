import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SseFrameParser, SseStreamError, streamSse } from './sse'

function controllableStream(): {
  stream: ReadableStream<Uint8Array>
  push: (text: string) => void
  close: () => void
  fail: (error: Error) => void
} {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController
    },
  })
  return {
    stream,
    push: (text: string) => controller?.enqueue(encoder.encode(text)),
    close: () => controller?.close(),
    fail: (error: Error) => controller?.error(error),
  }
}

/**
 * Stubs fetch with a stream the test drives frame by frame. Aborting the signal
 * errors the stream, which is how a real fetch response behaves.
 */
function stubStreamingFetch(options: { status?: number; withBody?: boolean } = {}) {
  const { stream, push, close, fail } = controllableStream()
  const calls: Array<{ url: string; headers: Headers; signal?: AbortSignal }> = []
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      signal: init?.signal ?? undefined,
    })
    init?.signal?.addEventListener('abort', () => {
      fail(new Error('The operation was aborted'))
    })
    const status = options.status ?? 200
    const body = options.withBody === false ? null : stream
    return new Response(body, { status })
  })
  return { calls, push, close }
}

describe('SseFrameParser', () => {
  it('parses a single data-only frame', () => {
    const parser = new SseFrameParser()
    expect(parser.push('data: {"id":"e:1"}\n\n')).toEqual(['{"id":"e:1"}'])
  })

  it('parses several frames arriving in one chunk', () => {
    const parser = new SseFrameParser()
    const payloads = parser.push('data: {"n":1}\n\ndata: {"n":2}\n\ndata: {"n":3}\n\n')
    expect(payloads).toEqual(['{"n":1}', '{"n":2}', '{"n":3}'])
  })

  it('buffers a frame split across arbitrary chunk boundaries', () => {
    const parser = new SseFrameParser()
    expect(parser.push('data: {"id"')).toEqual([])
    expect(parser.push(':"e:1","type":"Exec')).toEqual([])
    expect(parser.push('utionStarted"}\n')).toEqual([])
    expect(parser.push('\n')).toEqual(['{"id":"e:1","type":"ExecutionStarted"}'])
  })

  it('keeps a partial second frame buffered until it terminates', () => {
    const parser = new SseFrameParser()
    expect(parser.push('data: {"n":1}\n\ndata: {"n":2}')).toEqual(['{"n":1}'])
    expect(parser.push('\n\n')).toEqual(['{"n":2}'])
  })

  it('handles CRLF framing', () => {
    const parser = new SseFrameParser()
    expect(parser.push('data: {"n":1}\r\n\r\n')).toEqual(['{"n":1}'])
  })

  it('tolerates a missing space after the field name', () => {
    const parser = new SseFrameParser()
    expect(parser.push('data:{"n":1}\n\n')).toEqual(['{"n":1}'])
  })

  it('joins multi-line data fields of one frame', () => {
    const parser = new SseFrameParser()
    expect(parser.push('data: {"a":1,\ndata: "b":2}\n\n')).toEqual(['{"a":1,\n"b":2}'])
  })

  it('ignores frames that carry no data field', () => {
    const parser = new SseFrameParser()
    expect(parser.push(': keep-alive comment\n\n')).toEqual([])
    expect(parser.push('event: Ignored\nid: 7\n\n')).toEqual([])
  })

  it('emits malformed payloads verbatim so the caller decides how to fail', () => {
    const parser = new SseFrameParser()
    expect(parser.push('data: {not json\n\n')).toEqual(['{not json'])
  })

  it('flushes a trailing frame that never received its blank line', () => {
    const parser = new SseFrameParser()
    expect(parser.push('data: {"n":9}')).toEqual([])
    expect(parser.flush()).toEqual(['{"n":9}'])
    expect(parser.flush()).toEqual([])
  })
})

describe('streamSse', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends the bearer token in the Authorization header rather than the URL', async () => {
    const { calls, push, close } = stubStreamingFetch()
    const controller = new AbortController()
    const received: string[] = []

    const done = streamSse({
      url: '/api/v1/executions/exec_1/events',
      token: 'jwt-token-value',
      signal: controller.signal,
      onMessage: (payload) => {
        received.push(payload)
        return 'continue'
      },
    })

    push('data: {"id":"exec_1:1"}\n\n')
    close()
    await done

    expect(calls[0].headers.get('Authorization')).toBe('Bearer jwt-token-value')
    expect(calls[0].headers.get('Accept')).toBe('text/event-stream')
    expect(calls[0].url).not.toContain('jwt-token-value')
    expect(received).toEqual(['{"id":"exec_1:1"}'])
  })

  it('omits the Authorization header when there is no token', async () => {
    const { calls, close } = stubStreamingFetch()
    const controller = new AbortController()

    const done = streamSse({
      url: '/api/v1/executions/exec_1/events',
      token: null,
      signal: controller.signal,
      onMessage: () => 'continue',
    })
    close()
    await done

    expect(calls[0].headers.has('Authorization')).toBe(false)
  })

  it('reports onOpen before any frame and resolves when the server closes', async () => {
    const { push, close } = stubStreamingFetch()
    const order: string[] = []
    const controller = new AbortController()

    const done = streamSse({
      url: '/events',
      token: 't',
      signal: controller.signal,
      onOpen: () => order.push('open'),
      onMessage: () => {
        order.push('message')
        return 'continue'
      },
    })

    push('data: {"n":1}\n\n')
    close()
    await done

    expect(order).toEqual(['open', 'message'])
  })

  it('stops reading as soon as the consumer returns stop', async () => {
    const { push } = stubStreamingFetch()
    const controller = new AbortController()
    const received: string[] = []

    const done = streamSse({
      url: '/events',
      token: 't',
      signal: controller.signal,
      onMessage: (payload) => {
        received.push(payload)
        return 'stop'
      },
    })

    push('data: {"n":1}\n\ndata: {"n":2}\n\n')
    await done

    expect(received).toEqual(['{"n":1}'])
  })

  it('rejects with the status code when the stream request is refused', async () => {
    stubStreamingFetch({ status: 403 })
    const controller = new AbortController()

    await expect(
      streamSse({
        url: '/events',
        token: 't',
        signal: controller.signal,
        onMessage: () => 'continue',
      })
    ).rejects.toMatchObject({ name: 'SseStreamError', statusCode: 403 })
  })

  it('rejects when the response carries no readable body', async () => {
    stubStreamingFetch({ withBody: false })
    const controller = new AbortController()

    await expect(
      streamSse({
        url: '/events',
        token: 't',
        signal: controller.signal,
        onMessage: () => 'continue',
      })
    ).rejects.toBeInstanceOf(SseStreamError)
  })

  it('forwards the abort signal so unmounting cancels the request', async () => {
    const { calls, push } = stubStreamingFetch()
    const controller = new AbortController()
    const received: string[] = []

    const done = streamSse({
      url: '/events',
      token: 't',
      signal: controller.signal,
      onMessage: (payload) => {
        received.push(payload)
        return 'continue'
      },
    }).catch(() => 'aborted')

    push('data: {"n":1}\n\n')
    await Promise.resolve()
    controller.abort()

    await done

    expect(calls[0].signal?.aborted).toBe(true)
    expect(received.length).toBeLessThanOrEqual(1)
  })

  it('never constructs an EventSource', () => {
    // Guard against a regression back to EventSource, which cannot carry a Bearer header.
    const source = streamSse.toString()
    expect(source).not.toContain('EventSource')
  })
})
