import { vi } from 'vitest'

export interface StubResponse {
  status?: number
  body?: unknown
  /** Set instead of `body` to serve a streaming response (e.g. text/event-stream). */
  stream?: ReadableStream<Uint8Array>
  headers?: Record<string, string>
}

export interface StubRoute {
  match: (url: URL, method?: string) => boolean
  respond: (url: URL, method?: string, body?: unknown) => StubResponse
}

export interface StubRequestRecord {
  url: string
  method: string
  body?: unknown
}

interface StubApiResult {
  calls: string[]
  requests: StubRequestRecord[]
}

function parseBody(init?: RequestInit): unknown {
  const raw = init?.body
  if (typeof raw !== 'string') {
    return undefined
  }
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export function stubApi(routes: StubRoute[]): StubApiResult {
  const calls: string[] = []
  const requests: StubRequestRecord[] = []
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = String(input)
    const url = new URL(raw, 'http://localhost')
    calls.push(raw)
    requests.push({
      url: raw,
      method: init?.method ?? 'GET',
      body: parseBody(init),
    })
    const route = routes.find((candidate) => candidate.match(url, init?.method ?? 'GET'))
    if (!route) {
      return new Response(JSON.stringify({ message: `Unhandled request: ${raw}` }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      })
    }
    const method = init?.method ?? 'GET'
    const { status = 200, body, stream, headers } = route.respond(url, method, parseBody(init))
    if (stream) {
      return new Response(stream, {
        status,
        headers: { 'content-type': 'text/event-stream', ...headers },
      })
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })
  })
  return { calls, requests }
}
