import {
  calculateMessagesTokenSize,
  reduceContextSize,
} from '../src/lib/common/common';

// The real call path (send-prompt.ts) stores { role, content } message objects
// and may pass a model id tiktoken does not know; the estimator then falls back
// to the char-based heuristic. Drive the exact production shape here.
const MODEL = 'unknown-model-for-char-fallback';
const TOKENS_PER_CHAR = 0.25; // fallback: 4 chars ~ 1 token

function buildMessages(count: number, charsPerMessage: number) {
  return Array.from({ length: count }, (_, index) => ({
    role: index === 0 ? 'system' : index % 2 === 1 ? 'user' : 'assistant',
    content: `${index}-`.padEnd(charsPerMessage, 'x'),
  }));
}

describe('calculateMessagesTokenSize (production shape)', () => {
  it('counts tokens from message content, not the object shape', async () => {
    const messages = buildMessages(3, 40);
    const tokens = await calculateMessagesTokenSize(messages, MODEL);
    expect(tokens).toBe(3 * 40 * TOKENS_PER_CHAR);
  });
});

describe('reduceContextSize (issue #184)', () => {
  it('returns short histories unchanged without mutating the input', async () => {
    const messages = buildMessages(4, 40);
    const snapshot = JSON.parse(JSON.stringify(messages));
    const result = await reduceContextSize(messages, MODEL, 1000);
    expect(result).toEqual(messages);
    expect(messages).toEqual(snapshot);
  });

  it('reduces long histories until they fit maxTokens / 1.5', async () => {
    const messages = buildMessages(20, 40); // 20 x 10 tokens = 200 tokens
    const maxTokens = 100; // budget 66.6 tokens
    const result = await reduceContextSize(messages, MODEL, maxTokens);
    expect(result.length).toBeLessThan(messages.length);
    const tokens = await calculateMessagesTokenSize(result, MODEL);
    expect(tokens).toBeLessThanOrEqual(maxTokens / 1.5);
  });

  it('keeps cutting while a single cutoff is not enough (regression: discarded recursion)', async () => {
    const messages = buildMessages(100, 40); // 1000 tokens total
    const maxTokens = 100; // budget 66.6 tokens
    const result = await reduceContextSize(messages, MODEL, maxTokens);
    const tokens = await calculateMessagesTokenSize(result, MODEL);
    expect(tokens).toBeLessThanOrEqual(maxTokens / 1.5);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves relative order of the surviving messages (contiguous tail)', async () => {
    const messages = buildMessages(50, 40);
    const result = await reduceContextSize(messages, MODEL, 100);
    const allContents = messages.map((m) => m.content);
    const firstIndex = allContents.indexOf(result[0].content);
    expect(result.map((m) => m.content)).toEqual(allContents.slice(firstIndex));
  });

  it('does not mutate the caller array even for heavy histories', async () => {
    const messages = buildMessages(50, 40);
    const snapshot = messages.map((m) => ({ ...m }));
    await reduceContextSize(messages, MODEL, 100);
    expect(messages).toEqual(snapshot);
  });
});
