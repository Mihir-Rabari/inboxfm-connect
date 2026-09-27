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
) => {
  let tokenLength = 0;
  await Promise.all(
    messages.map((message: any) => {
      return new Promise((resolve) => {
        const text = typeof message === 'string' ? message : (message?.content ?? '');
        tokenLength += calculateTokensFromString(text, model);
        resolve(tokenLength);
      });
    })
  );

  return tokenLength;
};

export const reduceContextSize = async <T = any>(
  messages: T[],
  model: string,
  maxTokens: number
): Promise<T[]> => {
  // Defensive copy to prevent mutation of the caller's array
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
    const cutoffCount = Math.max(1, Math.round(currentMessages.length * 0.1));
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