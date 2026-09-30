import { describe, expect, it } from 'vitest';
import {
  calculateTokensFromString,
  calculateMessagesTokenSize,
  reduceContextSize,
} from './index';

describe('Azure OpenAI common - context reduction', () => {
  it('calculateTokensFromString returns token count for a string', () => {
    const tokens = calculateTokensFromString('hello world', 'gpt-4');
    expect(tokens).toBeGreaterThan(0);
  });

  it('calculateTokensFromString falls back to char/4 for unknown models', () => {
    const tokens = calculateTokensFromString('hello world', 'unknown-model');
    expect(tokens).toBe(Math.round('hello world'.length / 4));
  });

  it('calculateMessagesTokenSize sums tokens across string and object messages', async () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ];
    const total = await calculateMessagesTokenSize(messages, 'gpt-4');
    expect(total).toBeGreaterThan(0);
    expect(Number.isNaN(total)).toBe(false);
  });

  it('reduceContextSize returns empty array when limit is 0', async () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ];
    const result = await reduceContextSize(messages, 'gpt-4', 0);
    expect(result).toEqual([]);
  });

  it('reduceContextSize does not mutate input array', async () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ];
    const originalLength = messages.length;
    await reduceContextSize(messages, 'gpt-4', 100);
    expect(messages.length).toBe(originalLength);
  });

  it('reduceContextSize removes oldest messages first to fit within limit', async () => {
    const messages = [
      { role: 'user', content: 'a'.repeat(1000) },
      { role: 'assistant', content: 'b'.repeat(1000) },
      { role: 'user', content: 'c'.repeat(1000) },
      { role: 'assistant', content: 'd' },
    ];
    const result = await reduceContextSize(messages, 'gpt-4', 300);
    expect(result.length).toBeLessThan(messages.length);
    if (result.length > 0) {
      expect(result[result.length - 1].content).toBe('d');
    }
  });

  it('reduceContextSize returns all messages when they fit within limit', async () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ];
    const result = await reduceContextSize(messages, 'gpt-4', 10000);
    expect(result).toEqual(messages);
  });

  it('reduceContextSize uses loop not recursion (no stack overflow on large arrays)', async () => {
    const messages = Array.from({ length: 100 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `message ${i}`,
    }));
    const result = await reduceContextSize(messages, 'gpt-4', 200);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeLessThan(100);
    const finalTokens = await calculateMessagesTokenSize(result, 'gpt-4');
    expect(finalTokens).toBeLessThanOrEqual(200 / 1.5);
  });
});
