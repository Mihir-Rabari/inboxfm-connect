/**
 * Probes the endpoints the developer console reads, against the RUNNING backend.
 *
 * This is the check that caught the missing-migration blocker: the vitest suites use a
 * `synchronize`d schema, so only a real migrated database proves the relations exist.
 */
const BASE = process.env.GATE_API_URL ?? 'http://127.0.0.1:3000'

async function signIn() {
    const response = await fetch(`${BASE}/api/v1/authentication/sign-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'dev@ap.com', password: '12345678' }),
    })
    if (!response.ok) {
        throw new Error(`sign-in failed: ${response.status} ${await response.text()}`)
    }
    return response.json()
}

async function probe({ label, path, token }) {
    const response = await fetch(BASE + path, { headers: { Authorization: `Bearer ${token}` } })
    let detail = ''
    if (!response.ok) {
        detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 160)
    }
    else {
        const body = await response.text()
        detail = `${body.length} bytes`
    }
    return { label, status: response.status, detail }
}

const session = await signIn()
const { token, projectId } = session

const paths = [
    ['integrations', '/api/v1/integrations'],
    ['connections', `/api/v1/connections?projectId=${projectId}`],
    ['executions', `/api/v1/executions?projectId=${projectId}`],
    ['trigger-bindings', `/api/v1/trigger-bindings?projectId=${projectId}`],
    ['scheduled-tasks', `/api/v1/scheduled-tasks?projectId=${projectId}`],
    ['mcp-server', `/api/v1/projects/${projectId}/mcp-server`],
    ['projects', '/api/v1/projects'],
    ['flags', '/api/v1/flags'],
]

const results = []
for (const [label, path] of paths) {
    results.push(await probe({ label, path, token }))
}

console.log(JSON.stringify({ projectId, token, results }, null, 2))
