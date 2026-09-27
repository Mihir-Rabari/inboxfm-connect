import { describe, it, expect } from 'vitest';
import {
  reduceContextSize,
  calculateMessagesTokenSize,
} from '../src/lib/common/common';

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
    const longText =
      'This is a long sentence repeated multiple times to exceed token limits. '.repeat(
        20
      );
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

  it('drops oldest turns from the front and preserves newest turns during mid-array reduction', async () => {
    const messages = [
      { role: 'user', content: 'First user question with detailed description' },
      { role: 'assistant', content: 'First assistant response answering in full' },
      { role: 'user', content: 'Second user follow-up question on the topic' },
      { role: 'assistant', content: 'Second assistant answer with more details' },
      { role: 'user', content: 'Third and newest user question' },
      { role: 'assistant', content: 'Third and newest assistant answer' },
    ];

    // Measure tokens of the last exchange
    const lastExchangeTokens = await calculateMessagesTokenSize(
      messages.slice(4),
      'gpt-4o'
    );
    // Set maxTokens such that targetLimit accommodates the last exchange but not all 6 messages
    const maxTokens = Math.ceil(lastExchangeTokens * 1.6);

    const reduced = await reduceContextSize(messages, 'gpt-4o', maxTokens);

    expect(reduced.length).toBeGreaterThan(0);
    expect(reduced.length).toBeLessThan(messages.length);
    // Newest message must survive
    expect(reduced[reduced.length - 1]).toEqual(messages[messages.length - 1]);
    // Oldest message must have been dropped
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

    // Force a reduction that cuts some messages
    const reduced = await reduceContextSize(messages, 'gpt-4o', 30);

    if (reduced.length > 0) {
      expect(reduced[0].role).not.toBe('assistant');
    }
  });

  it('preserves all messages when token size is exactly at the boundary', async () => {
    const messages = [
      { role: 'user', content: 'Short ping' },
      { role: 'assistant', content: 'Short pong' },
    ];

    const currentTokens = await calculateMessagesTokenSize(messages, 'gpt-4o');
    // Set maxTokens so that targetTokenLimit (maxTokens / 1.5) == currentTokens exactly
    const maxTokens = Math.ceil(currentTokens * 1.5);

    const reduced = await reduceContextSize(messages, 'gpt-4o', maxTokens);
    expect(reduced).toEqual(messages);
  });

  it('preserves all messages when token size is well within limit', async () => {
    const messages = [
      { role: 'user', content: 'Short ping' },
      { role: 'assistant', content: 'Short pong' },
    ];

    const reduced = await reduceContextSize(messages, 'gpt-4o', 1000);
    expect(reduced).toEqual(messages);
  });

  it('returns empty array when maxTokens is zero or negative', async () => {
    const messages = [{ role: 'user', content: 'Any message' }];
    expect(await reduceContextSize(messages, 'gpt-4o', 0)).toEqual([]);
    expect(await reduceContextSize(messages, 'gpt-4o', -50)).toEqual([]);
  });

  it('handles empty messages gracefully', async () => {
    const reduced = await reduceContextSize([], 'gpt-4o', 100);
    expect(reduced).toEqual([]);
  });

  it('handles multimodal content parts and string messages defensively', async () => {
    const mixedMessages = [
      { role: 'user', content: [{ type: 'text', text: 'Hello multimodal' }] },
      'Plain string turn',
      { role: 'assistant', content: 'Standard string response' },
    ];

    const tokens = await calculateMessagesTokenSize(mixedMessages, 'gpt-4o');
    expect(tokens).toBeGreaterThan(0);

    const reduced = await reduceContextSize(mixedMessages, 'gpt-4o', 1000);
    expect(reduced).toEqual(mixedMessages);
  });
});
