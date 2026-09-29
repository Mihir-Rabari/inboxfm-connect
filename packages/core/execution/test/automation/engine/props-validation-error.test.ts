import { describe, expect, it } from 'vitest'
import { ExecutionErrorType, PropsValidationError } from '@inboxfm-connect/core-execution'

/**
 * Issue #169 — prop validation failures were raised as
 * `new Error(JSON.stringify(errors, null, 2))`. That threw away the error type
 * (so everything looked like an internal fault) and left the per-field errors
 * recoverable only by parsing the message.
 */

describe('PropsValidationError (Issue #169)', () => {
    it('is an ExecutionError, so the engine can classify it', () => {
        const error = new PropsValidationError({ title: 'Required' })
        expect(error).toBeInstanceOf(Error)
        expect(error.name).toBe('PropsValidationError')
        expect(error.type).toBe(ExecutionErrorType.USER)
    })

    it('keeps the per-field errors structured', () => {
        const errors = { title: 'Required', body: 'Must be a string' }
        const error = new PropsValidationError(errors)

        expect(error.errors).toEqual(errors)
        expect(Object.keys(error.errors)).toHaveLength(2)
    })

    it('renders every field into the message so it is readable without parsing', () => {
        const error = new PropsValidationError({ title: 'Required', body: 'Must be a string' })
        const message = String(error.message)

        expect(message).toContain('title')
        expect(message).toContain('Required')
        expect(message).toContain('body')
        expect(message).toContain('Must be a string')
        expect(message).toContain('Validation failed')
    })

    it('matches the shape the previous JSON.stringify produced', () => {
        // The old message was exactly `{"message": <string>}`, so anything
        // downstream that logged or parsed it keeps working.
        const error = new PropsValidationError({ title: 'Required' })
        const parsed = JSON.parse(String(error.message))

        expect(Object.keys(parsed)).toEqual(['message'])
        expect(typeof parsed.message).toBe('string')
    })

    it('does not throw on an empty error map', () => {
        // Defensive: the call site only constructs this when the map is
        // non-empty, but an empty map must not produce an empty message.
        const error = new PropsValidationError({})
        expect(error.errors).toEqual({})
        expect(String(error.message)).toContain('Validation failed')
    })

    it('carries a cause through when provided', () => {
        const cause = new Error('underlying')
        const error = new PropsValidationError({ title: 'Required' }, cause)
        expect(error.cause).toBe(cause)
    })

    it('keeps error values verbatim, including non-string values', () => {
        // The type says string, but a validator could hand back anything; the
        // class must not silently drop or mangle it.
        const errors = { count: 42 as unknown as string }
        const error = new PropsValidationError(errors)
        expect(error.errors).toEqual(errors)
    })

    it('is distinguishable from a generic internal error', () => {
        const generic = new Error('Validation failed: title: Required')
        const typed = new PropsValidationError({ title: 'Required' })

        expect(generic).not.toBeInstanceOf(PropsValidationError)
        expect(typed).toBeInstanceOf(PropsValidationError)
        expect(typed.type).toBe(ExecutionErrorType.USER)
    })
})
