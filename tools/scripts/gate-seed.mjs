/**
 * Seeds the minimum real data the browser click-through needs for its detail routes,
 * and reports the ids/names to drive them. Creates nothing that requires third-party
 * credentials.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const BASE = process.env.GATE_API_URL ?? 'http://127.0.0.1:3000'

async function api({ path, method = 'GET', token, body }) {
    const response = await fetch(BASE + path, {
        method,
        headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const text = await response.text()
    if (!response.ok) {
        throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 200)}`)
    }
    return text.length > 0 ? JSON.parse(text) : null
}

const session = await api({
    path: '/api/v1/authentication/sign-in',
    method: 'POST',
    body: { email: 'dev@ap.com', password: '12345678' },
})
const { token, projectId } = session

const integrations = await api({ path: '/api/v1/integrations', token })
const withActions = integrations.find((i) => Object.keys(i.actions ?? {}).length > 0) ?? integrations[0]
const actionName = withActions ? Object.keys(withActions.actions ?? {})[0] : null

const execution = await api({
    path: '/api/v1/executions',
    method: 'POST',
    token,
    body: {
        projectId,
        prompt: 'Release-gate browser verification execution',
        metadata: { source: 'gate-browser-verify' },
    },
})

if (execution?.id) {
    try {
        const routes = JSON.parse(readFileSync('gate-routes.json', 'utf8'))
        const detailRoute = routes.find((r) => r.label && r.label.includes('Execution detail'))
        if (detailRoute) {
            detailRoute.path = `/activity/${execution.id}`
            writeFileSync('gate-routes.json', JSON.stringify(routes, null, 2) + '\n')
        }
    }
    catch {
        // ignore route file update error
    }
}

console.log(JSON.stringify({
    token,
    projectId,
    integrationCount: integrations.length,
    integrationName: withActions?.name ?? null,
    actionName,
    executionId: execution?.id ?? null,
    executionStatus: execution?.status ?? null,
}, null, 2))
