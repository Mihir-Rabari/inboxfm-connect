import { describe, expect, it } from 'vitest'
import { ExecuteRequest, PieceProperty } from '@/lib/api/types'
import { generateCode, sanitizeExecuteRequest } from './code-generation'

const PROPS: Record<string, PieceProperty> = {
  title: { displayName: 'Title', required: true, type: 'SHORT_TEXT' },
  token: { displayName: 'Token', required: false, type: 'SECRET_TEXT' },
  rows: {
    displayName: 'Rows',
    required: false,
    type: 'ARRAY',
    properties: {
      secret: { displayName: 'Secret', required: false, type: 'SECRET_TEXT' },
    },
  },
}

function baseRequest(): ExecuteRequest {
  return {
    projectId: 'proj_snippet_1',
    integration: 'github',
    tool: 'createIssue',
    connectionId: 'conn_secret_123',
    input: {
      title: 'Hello',
      token: 'sk-live-abcdef',
      rows: [{ secret: 'row-secret', label: 'visible' }],
    },
  }
}

describe('sanitizeExecuteRequest', () => {
  it('replaces the connection id with a placeholder', () => {
    const sanitized = sanitizeExecuteRequest(PROPS, baseRequest())
    expect(sanitized.connectionId).toBe('$CONNECTION_ID')
    expect(JSON.stringify(sanitized)).not.toContain('conn_secret_123')
  })

  it('redacts SECRET_TEXT property values', () => {
    const sanitized = sanitizeExecuteRequest(PROPS, baseRequest())
    expect(sanitized.input['token']).toBe('$SECRET')
    expect(JSON.stringify(sanitized)).not.toContain('sk-live-abcdef')
  })

  it('redacts SECRET_TEXT values inside array subproperties while keeping safe fields', () => {
    const sanitized = sanitizeExecuteRequest(PROPS, baseRequest())
    const rows = sanitized.input['rows'] as Array<Record<string, unknown>>
    expect(rows[0]['secret']).toBe('$SECRET')
    expect(rows[0]['label']).toBe('visible')
  })
})

describe('generateCode', () => {
  const request = sanitizeExecuteRequest(PROPS, baseRequest())

  it('generates a cURL request with auth and the body-carried projectId', () => {
    const code = generateCode('curl', request)
    expect(code).toContain('curl -X POST')
    expect(code).toContain('"$BASE_URL/v1/execute"')
    expect(code).toContain('Authorization: Bearer $API_KEY')
    expect(code).toContain('"projectId": "proj_snippet_1"')
    expect(code).toContain('"integration": "github"')
    expect(code).toContain('"tool": "createIssue"')
    expect(code).not.toContain('sk-live-abcdef')
    expect(code).not.toContain('conn_secret_123')
  })

  it('generates a JavaScript fetch snippet', () => {
    const code = generateCode('javascript', request)
    expect(code).toContain('await fetch("$BASE_URL/v1/execute"')
    expect(code).toContain('process.env.API_KEY')
    expect(code).toContain('"projectId": "proj_snippet_1"')
    expect(code).toContain('"integration": "github"')
    expect(code).not.toContain('@inboxfm-connect/sdk')
    expect(code).not.toContain('sk-live-abcdef')
  })

  it('generates a TypeScript fetch snippet whose response type is the raw output', () => {
    const code = generateCode('typescript', request)
    expect(code).toContain('type ExecuteResponse = unknown;')
    expect(code).toContain('Promise<ExecuteResponse>')
    expect(code).toContain('await fetch("$BASE_URL/v1/execute"')
    expect(code).toContain('if (!response.ok)')
    expect(code).not.toContain('sk-live-abcdef')
  })

  it('generates a Python requests snippet that relies on the HTTP status', () => {
    const code = generateCode('python', request)
    expect(code).toContain('requests.post(')
    expect(code).toContain('$BASE_URL/v1/execute')
    expect(code).toContain("os.environ['API_KEY']")
    expect(code).toContain('response.raise_for_status()')
    expect(code).toContain('"integration": "github"')
    expect(code).not.toContain('sk-live-abcdef')
  })

  it('never advertises a success/standardOutput envelope that the backend does not return', () => {
    for (const language of ['curl', 'javascript', 'typescript', 'python'] as const) {
      const code = generateCode(language, request)
      expect(code).not.toContain('success: boolean')
      expect(code).not.toContain('standardOutput')
      // `x-project-id` is never read by the server; the body carries the project.
      expect(code).not.toContain('x-project-id')
    }
  })

  it('generates the raw JSON body', () => {
    const code = generateCode('json', request)
    const parsed = JSON.parse(code) as ExecuteRequest
    expect(parsed.integration).toBe('github')
    expect(parsed.tool).toBe('createIssue')
    expect(parsed.connectionId).toBe('$CONNECTION_ID')
    expect(parsed.input['title']).toBe('Hello')
  })

  it('never embeds the real connection id in any language', () => {
    for (const language of ['curl', 'javascript', 'typescript', 'python', 'json'] as const) {
      expect(generateCode(language, request)).not.toContain('conn_secret_123')
    }
  })
})
