import fs from 'node:fs'
import path from 'node:path'
import { AppSystemProp } from '@/app/helper/system/system-props'
import { domainHelper } from '@/app/helper/domain-helper'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SERVICE_FILE = path.resolve(__dirname, '../../../src/app/execution/trigger-binding/trigger-binding.service.ts')
const CONTROLLER_FILE = path.resolve(__dirname, '../../../src/app/execution/trigger-binding/trigger-binding.controller.ts')
const MODULE_FILE = path.resolve(__dirname, '../../../src/app/execution/trigger-binding/trigger-binding.module.ts')

const BINDING_ID = 'tb_01hzy3k9m4'

const ORIGINAL_FRONTEND_URL = process.env[AppSystemProp.FRONTEND_URL]

beforeEach(() => {
    process.env[AppSystemProp.FRONTEND_URL] = 'https://app.inboxfm.com'
})

afterEach(() => {
    if (ORIGINAL_FRONTEND_URL === undefined) {
        delete process.env[AppSystemProp.FRONTEND_URL]
    }
    else {
        process.env[AppSystemProp.FRONTEND_URL] = ORIGINAL_FRONTEND_URL
    }
})

/**
 * The public ingress paths the API actually serves for a trigger binding.
 * Derived from the real controller + module rather than hardcoded, so this
 * test fails if a route is renamed/removed and the advertised URL goes stale.
 */
function registeredTriggerBindingRoutes(): Set<string> {
    const moduleSource = fs.readFileSync(MODULE_FILE, 'utf8')
    const controllerSource = fs.readFileSync(CONTROLLER_FILE, 'utf8')

    const prefixMatch = moduleSource.match(/prefix:\s*'([^']+)'/)
    if (!prefixMatch) {
        throw new Error(`Could not read the trigger-binding route prefix from ${MODULE_FILE}`)
    }
    const prefix = prefixMatch[1].replace(/^\//, '')

    const routes = new Set<string>()
    const routePattern = /fastify\.(get|post|patch|delete|put)\(\s*'([^']*)'/g
    let match: RegExpExecArray | null
    while ((match = routePattern.exec(controllerSource)) !== null) {
        const [, method, route] = match
        const suffix = route === '' ? '' : route.replace(/^\//, '')
        routes.add(`${method.toUpperCase()} ${[prefix, suffix].filter(Boolean).join('/')}`)
    }
    return routes
}

describe('trigger binding public webhook URL', () => {
    it('derives the URL from the configured frontend URL, never a hardcoded localhost', async () => {
        const webhookUrl = await domainHelper.getPublicApiUrl({
            path: `v1/trigger-bindings/${BINDING_ID}/run`,
        })

        expect(webhookUrl).toBe(`https://app.inboxfm.com/api/v1/trigger-bindings/${BINDING_ID}/run`)
        expect(webhookUrl).not.toContain('localhost')
    })

    it('follows AP_FRONTEND_URL when it changes', async () => {
        process.env[AppSystemProp.FRONTEND_URL] = 'https://staging.example.org/base'

        const webhookUrl = await domainHelper.getPublicApiUrl({
            path: `v1/trigger-bindings/${BINDING_ID}/run`,
        })

        expect(webhookUrl).toBe(`https://staging.example.org/base/api/v1/trigger-bindings/${BINDING_ID}/run`)
    })

    it('throws loudly when AP_FRONTEND_URL is unset instead of falling back to localhost', async () => {
        delete process.env[AppSystemProp.FRONTEND_URL]

        await expect(domainHelper.getPublicApiUrl({
            path: `v1/trigger-bindings/${BINDING_ID}/run`,
        })).rejects.toThrow()
    })
})

describe('trigger binding webhook URL is a route that actually exists', () => {
    /**
     * Regression guard: the URL handed to pieces used to point at
     * `.../trigger-bindings/{id}/webhook`, but no such route is registered
     * anywhere in the API, so every external provider registered a dead
     * callback and events silently never arrived. Asserting the advertised
     * path against the real route table is what catches that class of bug.
     */
    it('extracts the advertised path from the service and matches a registered route', () => {
        const serviceSource = fs.readFileSync(SERVICE_FILE, 'utf8')

        const pathMatch = serviceSource.match(/path:\s*`v1\/trigger-bindings\/\$\{binding\.id\}(\/[^`]*)`/)
        expect(pathMatch, 'expected executeEngineHook to derive its URL via domainHelper.getPublicApiUrl').not.toBeNull()

        const leaf = pathMatch![1]
        const methodPattern = new RegExp(`fastify\\.post\\(\\s*'/:id${leaf.replace('/', '\\/')}'`)
        expect(
            methodPattern.test(fs.readFileSync(CONTROLLER_FILE, 'utf8')),
            `no POST route is registered for '/:id${leaf}' in trigger-binding.controller.ts`,
        ).toBe(true)

        expect(registeredTriggerBindingRoutes()).toContain(`POST v1/trigger-bindings/:id${leaf}`)
    })

    it('does not advertise the unregistered /webhook leaf', () => {
        const serviceSource = fs.readFileSync(SERVICE_FILE, 'utf8')
        expect(serviceSource).not.toContain('trigger-bindings/${binding.id}/webhook')
        expect(registeredTriggerBindingRoutes().has('POST v1/trigger-bindings/:id/webhook')).toBe(false)
    })

    it('the run route is served under the same public prefix the URL is built from', () => {
        // Sanity check on the prefix extraction itself, so a module prefix change
        // surfaces here rather than silently invalidating the URL above.
        const routes = registeredTriggerBindingRoutes()
        expect(routes).toContain('POST v1/trigger-bindings')
        expect(routes).toContain('POST v1/trigger-bindings/:id/run')
        for (const route of routes) {
            const path = route.split(' ').slice(1).join(' ')
            expect(path.startsWith('v1/trigger-bindings')).toBe(true)
        }
    })
})
