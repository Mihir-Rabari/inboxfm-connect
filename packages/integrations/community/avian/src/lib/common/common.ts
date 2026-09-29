import { encoding_for_model } from 'tiktoken';

export const baseUrl = 'https://api.avian.io/v1';

export const unauthorizedMessage = `Error Occurred: 401 \n
Ensure that your API key is valid. \n`;

export const calculateTokensFromString = (string: string, model: string) => {
  try {
    const encoder = encoding_for_model(model as any);
    const tokens = encoder.encode(string);
    encoder.free();

    return tokens.length;
  } catch (e) {
    // Model not supported by tiktoken, every 4 chars is a token
    return Math.round(string.length / 4);
  }
};

// The stored chat history holds { role, content } message objects (see
// ask-avian.ts), not plain strings, so the estimator must read the message
// content. Estimating the whole object (e.g. via String(message).length)
// silently returns NaN and disables the context guard entirely.
export const calculateMessagesTokenSize = async (
  messages: { role: string; content: string }[],
  model: string
) => {
  let tokenLength = 0;
  for (const message of messages) {
    tokenLength += calculateTokensFromString(message.content, model);
  }

  return tokenLength;
};

export const reduceContextSize = async (
  messages: { role: string; content: string }[],
  model: string,
  maxTokens: number,
  // Roles/system messages ride along on every request but are not part of the
  // history being reduced; subtract their tokens from the budget so what
  // remains actually fits alongside the system prompt.
  rolesTokenLength = 0
) => {
  // TODO: Summarize context instead of cutoff
  // Cut from the front (oldest first) without mutating the caller's array, and
  // keep cutting while the remaining history still exceeds the history budget
  // (what the model can accept alongside the completion). The budget is the
  // full window-derived budget, not the completion maxTokens alone: reducing
  // to maxTokens/1.5 would throw away valid history on large-window models
  // (review #387, item 2). The loop runs down to the last message so a single
  // oversized entry that alone exceeds the window is still dropped, storing an
  // empty history and letting a wedged memoryKey recover next run (review
  // #387, item 3).
  const budget = historyBudget(model, maxTokens);
  let currentMessages = [...messages];
  while (
    currentMessages.length >= 1 &&
    (await calculateMessagesTokenSize(currentMessages, model)) >
      budget - rolesTokenLength
  ) {
    const cutoffSize = Math.max(1, Math.round(currentMessages.length * 0.1));
    currentMessages = currentMessages.slice(cutoffSize);
  }

  return currentMessages;
};

// The history budget is what the model can actually accept as input: its
// context window minus the completion budget, capped by the platform's 32k
// system limit, with the /1.1 safety margin. Previously the message-count cap
// alone drove the limit, so history grew unbounded relative to the model. The
// budget is floored at 0 so a completion budget that exceeds the window (e.g.
// an unset/unknown model's conservative 2048 fallback) never turns the guard
// into an aggressive pre-truncator (review #387, item 1).
export const historyBudget = (model: string, maxTokens: number): number => {
  const byModelWindow = (modelTokenLimit(model) - maxTokens) / 1.1;
  return Math.max(0, Math.min(tokenLimit / 1.1, byModelWindow));
};

export const exceedsHistoryLimit = (
  tokenLength: number,
  model: string,
  maxTokens: number
) => {
  // When the budget is 0 (completion alone exceeds the window), the provider
  // will reject regardless and there is no history we can sensibly trim, so
  // do not preemptively discard the stored history.
  const budget = historyBudget(model, maxTokens);
  return budget > 0 && tokenLength >= budget;
};

export const tokenLimit = 32000;

// Context windows for the OpenAI-compatible models this piece's deployments
// run, aligned with the openai piece's sibling table: base gpt-3.5-turbo is
// 4096 — only the -16k variants are 16k. Unknown models keep the conservative
// 2048 fallback so deployments we cannot resolve to a known model never
// over-admit history.
export const modelTokenLimit = (model: string): number => {
  switch (model) {
    case 'gpt-4o':
    case 'gpt-4o-mini':
      return 128000;
    case 'gpt-4.1':
    case 'gpt-4.1-mini':
      return 1000000;
    case 'gpt-35-turbo':
    case 'gpt-3.5-turbo':
      return 4096;
    case 'gpt-35-turbo-16k':
    case 'gpt-3.5-turbo-16k':
    case 'gpt-35-turbo-1106':
    case 'gpt-3.5-turbo-1106':
      return 16385;
    case 'gpt-4':
      return 8192;
    default:
      return 2048;
  }
};