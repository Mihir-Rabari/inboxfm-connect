import { describe, it, expect } from 'vitest';
import { reduceContextSize, calculateMessagesTokenSize } from '../src/lib/common/index';

describe('reduceContextSize (Azure OpenAI)', () => {
  it('does not mutate the input messages array', async () => {
    const originalMessages = [
      'Hello from user turn 1',
      'Hello from assistant turn 1',
      'Follow up user question',
    ];
    const snapshot = [...originalMessages];

    const result = await reduceContextSize(originalMessages, '', 10);

    expect(originalMessages).toEqual(snapshot);
    expect(Array.isArray(result)).toBe(true);
  });

  it('reduces oversized context so token size is provably <= maxTokens / 1.5', async () => {
    const longText = 'This is a long sentence repeated multiple times to exceed token limits. '.repeat(20);
    const messages = [
      `Turn 1: ${longText}`,
      `Turn 2: ${longText}`,
      `Turn 3: ${longText}`,
      `Turn 4: ${longText}`,
      `Turn 5: ${longText}`,
    ];

    const maxTokens = 60;
    const targetLimit = maxTokens / 1.5;

    const reduced = await reduceContextSize(messages, '', maxTokens);
    const finalTokens = await calculateMessagesTokenSize(reduced, '');

    expect(finalTokens).toBeLessThanOrEqual(targetLimit);
    expect(reduced.length).toBeLessThan(messages.length);
  });

  it('preserves all messages when token size is already within limit', async () => {
    const messages = ['Short prompt', 'Short response'];

    const reduced = await reduceContextSize(messages, '', 1000);
    expect(reduced).toEqual(messages);
  });

  it('handles empty messages gracefully', async () => {
    const reduced = await reduceContextSize([], '', 100);
    expect(reduced).toEqual([]);
  });
});
