import { ExecuteRequest, PieceProperty } from '@/lib/api/types'

export type CodeLanguage = 'curl' | 'javascript' | 'typescript' | 'python' | 'json'

const SENSITIVE_KEY_PATTERN = /(secret|password|token|api[-_]?key|client[-_]?secret)/i

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Replaces credential material with placeholders so request previews and code
 * snippets can never leak secrets. The connection id becomes a placeholder even
 * though it is not itself a credential; nested inputs are inspected defensively
 * for accidental secret-looking keys.
 */
export function sanitizeExecuteRequest(
  props: Record<string, PieceProperty>,
  request: ExecuteRequest
): ExecuteRequest {
  return {
    ...request,
    connectionId: '$CONNECTION_ID',
    input: sanitizeInputValue(props, request.input),
  }
}

function sanitizeInputValue(
  props: Record<string, PieceProperty>,
  input: Record<string, unknown>
): Record<string, unknown> {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    const property = props[key]
    if (property?.type === 'SECRET_TEXT') {
      output[key] = '$SECRET'
      continue
    }
    if (property?.type === 'ARRAY' && Array.isArray(value)) {
      output[key] = value.map((row) =>
        isPlainObject(row) ? sanitizeInputValue(property.properties ?? {}, row) : row
      )
      continue
    }
    output[key] = redactSensitiveKeys(value)
  }
  return output
}

function redactSensitiveKeys(value: unknown): unknown {
  if (!isPlainObject(value)) {
    return value
  }
  const output: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key) && typeof inner === 'string' && inner !== '') {
      output[key] = '$SECRET'
    } else {
      output[key] = redactSensitiveKeys(inner)
    }
  }
  return output
}

function indentedJson(request: ExecuteRequest, indent: number): string {
  const pad = ' '.repeat(indent)
  return JSON.stringify(request, null, 2)
    .split('\n')
    .map((line, index) => (index === 0 ? line : pad + line))
    .join('\n')
}

function generateCurl(request: ExecuteRequest): string {
  return [
    'curl -X POST \\',
    '  "$BASE_URL/v1/execute" \\',
    '  -H "Authorization: Bearer $API_KEY" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '${indentedJson(request, 0)}'`,
  ].join('\n')
}

function generateFetchSnippet(
  request: ExecuteRequest,
  language: 'javascript' | 'typescript'
): string {
  const headerLines = [
    '  headers: {',
    '    "Authorization": `Bearer ${process.env.API_KEY}`,',
    '    "Content-Type": "application/json",',
    '  },',
  ]
  const bodyLines = [
    `  body: JSON.stringify(${JSON.stringify(request, null, 2).replace(/\n/g, '\n  ')}),`,
  ]
  const lines =
    language === 'typescript'
      ? [
          '// Requires Node 18+ (global fetch).',
          '// POST /v1/execute resolves to the RAW action output — there is no',
          '// { success, output, error } envelope. A non-2xx status signals failure.',
          'type ExecuteResponse = unknown;',
          '',
          'async function execute(): Promise<ExecuteResponse> {',
          '  const response = await fetch("$BASE_URL/v1/execute", {',
          '    method: "POST",',
          ...headerLines.map((line) => '  ' + line),
          ...bodyLines.map((line) => '  ' + line),
          '  });',
          '  if (!response.ok) {',
          '    throw new Error(`Execution request failed: ${response.status}`);',
          '  }',
          '  return response.json();',
          '}',
          '',
          'void execute();',
        ]
      : [
          '// Requires Node 18+ (global fetch) or a browser.',
          'const response = await fetch("$BASE_URL/v1/execute", {',
          '  method: "POST",',
          ...headerLines,
          ...bodyLines,
          '});',
          '',
          'const result = await response.json();',
          'console.log(result);',
        ]
  return lines.join('\n')
}

function generatePython(request: ExecuteRequest): string {
  return [
    'import json',
    'import os',
    '',
    'import requests',
    '',
    'payload = json.loads("""',
    JSON.stringify(request, null, 2),
    '""")',
    '',
    'response = requests.post(',
    '    "$BASE_URL/v1/execute",',
    '    headers={',
    '        "Authorization": f"Bearer {os.environ[\'API_KEY\']}",',
    '        "Content-Type": "application/json",',
    '    },',
    '    json=payload,',
    ')',
    '',
    'response.raise_for_status()',
    '',
    '# The body is the raw action output — there is no success/output envelope.',
    'print(response.json())',
  ].join('\n')
}

export function generateCode(language: CodeLanguage, request: ExecuteRequest): string {
  switch (language) {
    case 'curl':
      return generateCurl(request)
    case 'javascript':
      return generateFetchSnippet(request, 'javascript')
    case 'typescript':
      return generateFetchSnippet(request, 'typescript')
    case 'python':
      return generatePython(request)
    case 'json':
      return JSON.stringify(request, null, 2)
  }
}
