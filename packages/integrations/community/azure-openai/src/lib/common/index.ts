import { encoding_for_model } from 'tiktoken';

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

export const calculateMessagesTokenSize = async (
  messages: any[],
  model: string
): Promise<number> => {
  let tokenLength = 0;
  for (const message of messages) {
    let text = '';
    if (typeof message === 'string') {
      text = message;
    } else if (message && typeof message === 'object') {
      if (typeof message.content === 'string') {
        text = message.content;
      } else if (Array.isArray(message.content)) {
        text = message.content
          .map((part: any) => (typeof part === 'string' ? part : part?.text ?? ''))
          .join(' ');
      } else if (message.content !== undefined && message.content !== null) {
        text = String(message.content);
      }
    }
    tokenLength += calculateTokensFromString(text, model);
  }

  return tokenLength;
};

export const reduceContextSize = async <T = any>(
  messages: T[],
  model: string,
  maxTokens: number
): Promise<T[]> => {
  if (maxTokens <= 0 || messages.length === 0) {
    return [];
  }

  // Shallow defensive copy: outer array is copied so caller array is not mutated; message objects are shared.
  let currentMessages = [...messages];
  const targetTokenLimit = maxTokens / 1.5;

  // Note: Model-based summarization requires an active API client and credentials.
  // In this standalone helper, we iteratively discard the oldest turns from the front
  // of the conversation until the total size is within targetTokenLimit.
  while (currentMessages.length > 0) {
    const currentTokens = await calculateMessagesTokenSize(currentMessages, model);
    if (currentTokens <= targetTokenLimit) {
      break;
    }
    let cutoffCount = Math.max(1, Math.round(currentMessages.length * 0.1));
    // Advance cutoff to the next user message boundary so exchanges stay paired (avoid orphaned leading assistant)
    while (
      cutoffCount < currentMessages.length &&
      (currentMessages[cutoffCount] as any)?.role === 'assistant'
    ) {
      cutoffCount++;
    }
    currentMessages = currentMessages.slice(cutoffCount);
  }

  return currentMessages;
};

export const exceedsHistoryLimit = (
  tokenLength: number,
  model: string,
  maxTokens: number
) => {
  if (
    tokenLength >= tokenLimit / 1.1 ||
    tokenLength >= (modelTokenLimit(model) - maxTokens) / 1.1
  ) {
    return true;
  }

  return false;
};

export const tokenLimit = 32000;

export const modelTokenLimit = (model: string) => {
  switch (model) {
    default:
      return 2048;
  }
};