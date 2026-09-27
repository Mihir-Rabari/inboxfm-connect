import { describe, it, expect } from 'vitest';
import { reduceContextSize, calculateMessagesTokenSize } from '../src/lib/common/common';

describe('reduceContextSize (OpenAI)', () => {
  it('does not mutate the input messages array', async () => {
    const originalMessages = [
      { role: 'user', content: 'Hello there, how are you today?' },
      { role: 'assistant', content: 'I am doing well, thank you!' },
      { role: 'user', content: 'Can you tell me about AI automation?' },
    ];
    const snapshot = JSON.parse(JSON.stringify(originalMessages));

    const result = await reduceContextSize(originalMessages, 'gpt-4o', 10);

    expect(originalMessages).toEqual(snapshot);
    expect(Array.isArray(result)).toBe(true);
  });

  it('reduces oversized context so token size is provably <= maxTokens / 1.5', async () => {
    const longText = 'This is a long sentence repeated multiple times to exceed token limits. '.repeat(20);
    const messages = [
      { role: 'user', content: `Turn 1: ${longText}` },
      { role: 'assistant', content: `Turn 2: ${longText}` },
      { role: 'user', content: `Turn 3: ${longText}` },
      { role: 'assistant', content: `Turn 4: ${longText}` },
      { role: 'user', content: `Turn 5: ${longText}` },
    ];

    const maxTokens = 60;
    const targetLimit = maxTokens / 1.5;

    const reduced = await reduceContextSize(messages, 'gpt-4o', maxTokens);
    const finalTokens = await calculateMessagesTokenSize(reduced, 'gpt-4o');

    expect(finalTokens).toBeLessThanOrEqual(targetLimit);
    expect(reduced.length).toBeLessThan(messages.length);
  });

  it('preserves all messages when token size is already within limit', async () => {
    const messages = [
      { role: 'user', content: 'Short ping' },
      { role: 'assistant', content: 'Short pong' },
    ];

    const reduced = await reduceContextSize(messages, 'gpt-4o', 1000);
    expect(reduced).toEqual(messages);
  });

  it('handles empty messages gracefully', async () => {
    const reduced = await reduceContextSize([], 'gpt-4o', 100);
    expect(reduced).toEqual([]);
  });
});
