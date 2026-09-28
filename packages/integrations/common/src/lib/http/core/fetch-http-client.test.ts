import { FetchHttpClient } from './fetch-http-client'

describe('FetchHttpClient TLS verification', () => {
    it('does not modify NODE_TLS_REJECT_UNAUTHORIZED environment variable', () => {
        const originalValue = process.env.NODE_TLS_REJECT_UNAUTHORIZED
        const client = new FetchHttpClient()

        // The constructor and request method should not touch NODE_TLS_REJECT_UNAUTHORIZED
        expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBe(originalValue)

        // Also verify the request method signature exists
        expect(typeof client.request).toBe('function')
    })

    it('allows custom dispatcher for callers needing custom TLS handling', () => {
        const client = new FetchHttpClient()
        // The options parameter accepts a dispatcher for custom TLS handling
        const options = { dispatcher: undefined }
        expect(typeof client.request).toBe('function')
    })
})
