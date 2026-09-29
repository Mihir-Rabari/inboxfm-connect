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
  messages: string[],
  model: string
) => {
  let tokenLength = 0;
  await Promise.all(
    messages.map((message: string) => {
      return new Promise((resolve) => {
        tokenLength += calculateTokensFromString(message, model);
        resolve(tokenLength);
      });
    })
  );

  return tokenLength;
};

export const reduceContextSize = async (
  messages: string[],
  model: string,
  maxTokens: number
) => {
  // Summarize context instead of cutoff: iteratively remove oldest messages
  // until the remaining messages fit within maxTokens / 1.5
  // Does not mutate the input array.
  const messagesCopy = [...messages];
  let totalTokens = await calculateMessagesTokenSize(messagesCopy, model);
  const limit = maxTokens / 1.5;

  while (totalTokens > limit && messagesCopy.length > 0) {
    // Remove the oldest message (first in array) to reduce token count
    const removed = messagesCopy.shift();
    if (!removed) break;
    const removedTokens = calculateTokensFromString(removed, model);
    totalTokens -= removedTokens;
  }

  return messagesCopy;
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