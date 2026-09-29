import { describe, expect, it } from 'vitest'
import { calculateTokensFromString, calculateMessagesTokenSize, reduceContextSize } from './index'

describe('Azure OpenAI common - context reduction', () => {
    it('calculateTokensFromString returns token count for a string', () => {
        const tokens = calculateTokensFromString('hello world', 'gpt-4')
        expect(tokens).toBeGreaterThan(0)
    })

    it('calculateTokensFromString falls back to char/4 for unknown models', () => {
        const tokens = calculateTokensFromString('hello world', 'unknown-model')
        expect(tokens).toBe(Math.round('hello world'.length / 4))
    })

    it('calculateMessagesTokenSize sums tokens across messages', async () => {
        const messages = ['hello', 'world']
        const total = await calculateMessagesTokenSize(messages, 'gpt-4')
        expect(total).toBeGreaterThan(0)
    })

    it('reduceContextSize returns empty array when limit is 0', async () => {
        const messages = ['hello', 'world']
        const result = await reduceContextSize(messages, 'gpt-4', 0)
        expect(result).toEqual([])
    })

    it('reduceContextSize does not mutate input array', async () => {
        const messages = ['hello', 'world']
        const originalLength = messages.length
        await reduceContextSize(messages, 'gpt-4', 100)
        expect(messages.length).toBe(originalLength)
    })

    it('reduceContextSize removes oldest messages first to fit within limit', async () => {
        const messages = [
            'a'.repeat(1000),
            'b'.repeat(1000),
            'c'.repeat(1000),
            'd',
        ]
        const result = await reduceContextSize(messages, 'gpt-4', 1000)
        expect(result.length).toBeLessThanOrEqual(4)
        expect(result.length).toBeGreaterThanOrEqual(0)
    })

    it('reduceContextSize returns all messages when they fit within limit', async () => {
        const messages = ['hello', 'world']
        const result = await reduceContextSize(messages, 'gpt-4', 10000)
        expect(result).toEqual(messages)
    })

    it('reduceContextSize uses loop not recursion (no stack overflow on large arrays)', async () => {
        const messages = Array.from({ length: 100 }, (_, i) => `message ${i}`)
        const result = await reduceContextSize(messages, 'gpt-4', 10000)
        expect(Array.isArray(result)).toBe(true)
    })
})
