import {
  calculateMessagesTokenSize,
  exceedsHistoryLimit,
  historyBudget,
  modelTokenLimit,
  reduceContextSize,
} from '../src/lib/common/utils';

// The real call path (ask-grok.ts) stores { role, content } objects and passes
// the served model id — tiktoken may reject custom ids, so the char-based
// fallback estimator runs. These tests drive the exact production shape.
const MODEL = '';
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

  it('returns a finite number, never NaN', async () => {
    const messages = buildMessages(5, 100);
    const tokens = await calculateMessagesTokenSize(messages, MODEL);
    expect(Number.isFinite(tokens)).toBe(true);
  });
});

describe('reduceContextSize (production shape)', () => {
  it('returns short histories unchanged without mutating the input', async () => {
    const messages = buildMessages(4, 40);
    const snapshot = JSON.parse(JSON.stringify(messages));
    const result = await reduceContextSize(messages, MODEL, 1000);
    expect(result).toEqual(messages);
    expect(messages).toEqual(snapshot);
  });

  it('reduces long histories until they fit maxTokens / 1.5', async () => {
    const messages = buildMessages(20, 40);
    const maxTokens = 100;
    const result = await reduceContextSize(messages, MODEL, maxTokens);
    const tokens = await calculateMessagesTokenSize(result, MODEL);
    expect(tokens).toBeLessThanOrEqual(maxTokens / 1.5);
  });

  it('keeps cutting while a single cutoff is not enough', async () => {
    const messages = buildMessages(100, 40);
    const maxTokens = 100;
    const result = await reduceContextSize(messages, MODEL, maxTokens);
    const tokens = await calculateMessagesTokenSize(result, MODEL);
    expect(tokens).toBeLessThanOrEqual(maxTokens / 1.5);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves relative order of the surviving messages', async () => {
    const messages = buildMessages(50, 40);
    const result = await reduceContextSize(messages, MODEL, 100);
    const allContents = messages.map((m) => m.content);
    const firstIndex = allContents.indexOf(result[0].content);
    expect(result.map((m) => m.content)).toEqual(
      allContents.slice(firstIndex),
    );
  });
});

describe('exceedsHistoryLimit (guard fires on production shape)', () => {
  it('triggers only when the history actually exceeds the budget', async () => {
    const small = buildMessages(20, 100);
    const smallTokens = await calculateMessagesTokenSize(small, MODEL);
    expect(exceedsHistoryLimit(smallTokens, MODEL, 100)).toBe(false);
    const big = buildMessages(80, 100);
    const bigTokens = await calculateMessagesTokenSize(big, MODEL);
    expect(exceedsHistoryLimit(bigTokens, MODEL, 100)).toBe(true);
  });

  it('system tokens count toward the guard alongside a large system prompt', async () => {
    const history = buildMessages(20, 100);
    const historyTokens = await calculateMessagesTokenSize(history, MODEL);
    expect(exceedsHistoryLimit(historyTokens, MODEL, 100)).toBe(false);
    const system = buildMessages(60, 100);
    const systemTokens = await calculateMessagesTokenSize(system, MODEL);
    expect(exceedsHistoryLimit(historyTokens + systemTokens, MODEL, 100)).toBe(true);
  });
});

describe('historyBudget: window-derived budgets', () => {
  it('gives a large-window model the full 32k system cap', () => {
    expect(historyBudget('grok-4', 2048)).toBe(32000 / 1.1);
  });

  it('never exceeds the 32k system cap', () => {
    expect(historyBudget('grok-4.1', 2048)).toBe(32000 / 1.1);
  });

  it('subtracts the completion budget from small-window models', () => {
    // grok-3-mini: 128k window - 2048 completion, capped by the 32k system
    // limit -> the system cap applies.
    expect(historyBudget('grok-3-mini', 2048)).toBe(32000 / 1.1);
  });

  it('falls back to the conservative legacy budget for unknown models', () => {
    expect(modelTokenLimit('')).toBe(2048);
    expect(historyBudget('', 2048)).toBe((2048 - 2048) / 1.1);
  });
});

describe('modelTokenLimit table', () => {
  it.each([
    ['grok-4', 1000000],
    ['grok-4-fast', 1000000],
    ['grok-3-beta', 256000],
    ['grok-3-fast-beta', 256000],
    ['grok-3-mini-beta', 256000],
    ['grok-3-mini', 128000],
    ['grok-2-image-1212', 128000],
  ] as Array<[string, number]>)('quotes %s at its real context window', (model, window) => {
    expect(modelTokenLimit(model)).toBe(window);
  });

  it('keeps unknown models on the conservative 2048 fallback', () => {
    expect(modelTokenLimit('a-custom-finetuned-model')).toBe(2048);
  });
});