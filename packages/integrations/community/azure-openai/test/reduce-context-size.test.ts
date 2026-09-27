import { describe, it, expect } from 'vitest';
import {
  reduceContextSize,
  calculateMessagesTokenSize,
} from '../src/lib/common/index';

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
    const longText =
      'This is a long sentence repeated multiple times to exceed token limits. '.repeat(
        20
      );
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

  it('drops oldest turns from the front and preserves newest turns during mid-array reduction', async () => {
    const messages = [
      { role: 'user', content: 'Initial user inquiry about Azure services' },
      { role: 'assistant', content: 'Detailed response from Azure OpenAI model' },
      { role: 'user', content: 'Second follow-up query regarding deployments' },
      { role: 'assistant', content: 'Comprehensive reply regarding deployment configuration' },
      { role: 'user', content: 'Third and newest user question' },
      { role: 'assistant', content: 'Third and newest assistant reply' },
    ];

    const lastExchangeTokens = await calculateMessagesTokenSize(
      messages.slice(4),
      ''
    );
    const maxTokens = Math.ceil(lastExchangeTokens * 1.6);

    const reduced = await reduceContextSize(messages, '', maxTokens);

    expect(reduced.length).toBeGreaterThan(0);
    expect(reduced.length).toBeLessThan(messages.length);
    expect(reduced[reduced.length - 1]).toEqual(messages[messages.length - 1]);
    expect(reduced).not.toContainEqual(messages[0]);
  });

  it('preserves exchange boundaries and avoids leaving an orphaned leading assistant message', async () => {
    const messages = [
      { role: 'user', content: 'User turn 1' },
      { role: 'assistant', content: 'Assistant turn 1' },
      { role: 'user', content: 'User turn 2' },
      { role: 'assistant', content: 'Assistant turn 2' },
      { role: 'user', content: 'User turn 3' },
      { role: 'assistant', content: 'Assistant turn 3' },
    ];

    const reduced = await reduceContextSize(messages, '', 30);

    if (reduced.length > 0) {
      expect(reduced[0].role).not.toBe('assistant');
    }
  });

  it('preserves all messages when token size is exactly at the boundary', async () => {
    const messages = ['Short prompt', 'Short response'];

    const currentTokens = await calculateMessagesTokenSize(messages, '');
    const maxTokens = Math.ceil(currentTokens * 1.5);

    const reduced = await reduceContextSize(messages, '', maxTokens);
    expect(reduced).toEqual(messages);
  });

  it('preserves all messages when token size is well within limit', async () => {
    const messages = ['Short prompt', 'Short response'];

    const reduced = await reduceContextSize(messages, '', 1000);
    expect(reduced).toEqual(messages);
  });

  it('returns empty array when maxTokens is zero or negative', async () => {
    const messages = ['Any message'];
    expect(await reduceContextSize(messages, '', 0)).toEqual([]);
    expect(await reduceContextSize(messages, '', -20)).toEqual([]);
  });

  it('handles empty messages gracefully', async () => {
    const reduced = await reduceContextSize([], '', 100);
    expect(reduced).toEqual([]);
  });

  it('supports object-shaped messages as well as string messages', async () => {
    const objectMessages = [
      { role: 'user', content: 'User message in object format' },
      { role: 'assistant', content: 'Assistant reply in object format' },
    ];

    const tokens = await calculateMessagesTokenSize(objectMessages, '');
    expect(tokens).toBeGreaterThan(0);

    const reduced = await reduceContextSize(objectMessages, '', 1000);
    expect(reduced).toEqual(objectMessages);
  });
});
