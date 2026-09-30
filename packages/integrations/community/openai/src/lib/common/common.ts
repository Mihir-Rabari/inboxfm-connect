import { encoding_for_model, Tiktoken } from 'tiktoken';

export const baseUrl = 'https://api.openai.com/v1';

export const Languages = [
  { value: 'es', label: 'Spanish' },
  { value: 'it', label: 'Italian' },
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
  { value: 'pl', label: 'Polish' },
  { value: 'ar', label: 'Arabic' },
  { value: 'af', label: 'Afrikaans' },
  { value: 'az', label: 'Azerbaijani' },
  { value: 'bg', label: 'Bulgarian' },
  { value: 'bs', label: 'Bosnian' },
  { value: 'ca', label: 'Catalan' },
  { value: 'cs', label: 'Czech' },
  { value: 'da', label: 'Danish' },
  { value: 'el', label: 'Greek' },
  { value: 'et', label: 'Estonian' },
  { value: 'fa', label: 'Persian' },
  { value: 'fi', label: 'Finnish' },
  { value: 'tl', label: 'Tagalog' },
  { value: 'fr', label: 'French' },
  { value: 'gl', label: 'Galician' },
  { value: 'he', label: 'Hebrew' },
  { value: 'hi', label: 'Hindi' },
  { value: 'hr', label: 'Croatian' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'hy', label: 'Armenian' },
  { value: 'id', label: 'Indonesian' },
  { value: 'is', label: 'Icelandic' },
  { value: 'kk', label: 'Kazakh' },
  { value: 'kn', label: 'Kannada' },
  { value: 'ko', label: 'Korean' },
  { value: 'lt', label: 'Lithuanian' },
  { value: 'lv', label: 'Latvian' },
  { value: 'ma', label: 'Maori' },
  { value: 'mk', label: 'Macedonian' },
  { value: 'mr', label: 'Marathi' },
  { value: 'ms', label: 'Malay' },
  { value: 'ne', label: 'Nepali' },
  { value: 'nl', label: 'Dutch' },
  { value: 'no', label: 'Norwegian' },
  { value: 'ro', label: 'Romanian' },
  { value: 'ru', label: 'Russian' },
  { value: 'sk', label: 'Slovak' },
  { value: 'sl', label: 'Slovenian' },
  { value: 'sr', label: 'Serbian' },
  { value: 'sv', label: 'Swedish' },
  { value: 'sw', label: 'Swahili' },
  { value: 'ta', label: 'Tamil' },
  { value: 'th', label: 'Thai' },
  { value: 'tr', label: 'Turkish' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'ur', label: 'Urdu' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'zh', label: 'Chinese (Simplified)' },
  { value: 'cy', label: 'Welsh' },
  { value: 'be', label: 'Belarusian' },
];

export const billingIssueMessage = `Error Occurred: 429 \n
1. Ensure that billing is enabled on your OpenAI platform. \n
2. Generate a new API key. \n
3. Attempt the process again. \n
For guidance, visit: https://beta.openai.com/account/billing`;

export const unauthorizedMessage = `Error Occurred: 401 \n
Ensure that your API key is valid. \n`;

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const streamToBuffer = (stream: any) => {
  const chunks: any[] = [];
  return new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err: Error) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

const encoderCache = new Map<string, Tiktoken>();

function getEncoder(model: string): Tiktoken | null {
  if (!encoderCache.has(model)) {
    try {
      const enc = encoding_for_model(model as Parameters<typeof encoding_for_model>[0]);
      encoderCache.set(model, enc);
    } catch {
      return null;
    }
  }
  return encoderCache.get(model) ?? null;
}

function isTiktokenModel(model: string): model is Parameters<typeof encoding_for_model>[0] {
  return typeof model === 'string';
}

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null;
}

function getRole(message: unknown): string | undefined {
  if (isRecord(message) && typeof message['role'] === 'string') {
    return message['role'];
  }
  return undefined;
}

function extractMessageText(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  if (isRecord(message)) {
    const content = message['content'];
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      return content
        .map((part: unknown) => {
          if (typeof part === 'string') {
            return part;
          }
          if (isRecord(part) && typeof part['text'] === 'string') {
            return part['text'];
          }
          return '';
        })
        .join(' ');
    }
    if (content !== undefined && content !== null) {
      return String(content);
    }
  }
  return '';
}

export const calculateTokensFromString = (string: string, model: string): number => {
  try {
    const encoder = getEncoder(model);
    if (encoder) {
      return encoder.encode(string).length;
    }
    return Math.round(string.length / 4);
  } catch (e) {
    // Model not supported by tiktoken, every 4 chars is a token
    return Math.round(string.length / 4);
  }
};

export const calculateMessagesTokenSize = async (
  messages: readonly unknown[],
  model: string
): Promise<number> => {
  let tokenLength = 0;
  for (const message of messages) {
    const text = extractMessageText(message);
    tokenLength += calculateTokensFromString(text, model);
  }

  return tokenLength;
};

export const reduceContextSize = async <T = unknown>(
  messages: readonly T[],
  model: string,
  maxTokens: number
): Promise<T[]> => {
  if (maxTokens <= 0 || messages.length === 0) {
    return [];
  }

  // Shallow defensive copy: outer array is copied so caller array is not mutated; message objects are shared.
  const currentMessages = [...messages];
  const targetTokenLimit = maxTokens / 1.5;
  let totalTokens = await calculateMessagesTokenSize(currentMessages, model);

  while (totalTokens > targetTokenLimit && currentMessages.length > 0) {
    const removed = currentMessages.shift();
    if (!removed) break;
    totalTokens -= calculateTokensFromString(extractMessageText(removed), model);

    // If removing this message left an orphaned leading assistant turn, advance past it
    while (
      currentMessages.length > 0 &&
      getRole(currentMessages[0]) === 'assistant'
    ) {
      const extra = currentMessages.shift();
      if (!extra) break;
      totalTokens -= calculateTokensFromString(extractMessageText(extra), model);
    }
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
    case 'gpt-4-1106-preview':
      return 128000;
    case 'gpt-4-vision-preview':
      return 128000;
    case 'gpt-4':
      return 8192;
    case 'gpt-4-32k':
      return 32768;
    case 'gpt-4-0613':
      return 8192;
    case 'gpt-4-32k-0613':
      return 32768;
    case 'gpt-4-0314':
      return 8192;
    case 'gpt-4-32k-0314':
      return 32768;
    case 'gpt-3.5-turbo-1106':
      return 16385;
    case 'gpt-3.5-turbo':
      return 4096;
    case 'gpt-3.5-turbo-16k':
      return 16385;
    case 'gpt-3.5-turbo-instruct':
      return 4096;
    case 'gpt-3.5-turbo-0613':
      return 4096;
    case 'gpt-3.5-turbo-16k-0613':
      return 16385;
    case 'gpt-3.5-turbo-0301':
      return 4096;
    case 'text-davinci-003':
      return 4096;
    case 'text-davinci-002':
      return 4096;
    case 'code-davinci-002':
      return 8001;
    case 'text-moderation-latest':
      return 32768;
    case 'text-moderation-stable':
      return 32768;
    case 'gpt-5':
      return 400000;
    case 'gpt-5-chat-latest':
      return 400000;
    case 'gpt-5-mini':
      return 400000;
    case 'gpt-5-nano':
      return 400000;
    default:
      return 2048;
  }
};

// Models that aren't chat-completion-capable text LLMs and should be filtered
// out of the chat-model dropdowns (ask_chatgpt, extract-structured-data, etc.).
const notLLMExactIds = [
  'gpt-4o-realtime-preview-2024-10-01',
  'gpt-4o-realtime-preview',
  'babbage-002',
  'davinci-002',
  'tts-1-hd-1106',
  'whisper-1',
  'canary-whisper',
  'canary-tts',
  'tts-1',
  'tts-1-hd',
  'tts-1-1106',
  'dall-e-3',
  'dall-e-2',
  'gpt-image-1',
  'gpt-image-2',
];

const notLLMPrefixes = [
  'text-embedding-',
  'text-moderation-',
  'omni-moderation-',
  'tts-',
  'whisper-',
  'dall-e-',
  'sora-',
  'computer-use-',
  'codex-',
];

export const isLLM = (modelId: string): boolean => {
  if (notLLMExactIds.includes(modelId)) return false;
  if (notLLMPrefixes.some((p) => modelId.startsWith(p))) return false;
  if (modelId.includes('realtime')) return false;
  if (modelId.includes('audio')) return false;
  if (modelId.includes('transcribe')) return false;
  if (modelId.includes('image')) return false;
  return true;
};

export const notLLMs = notLLMExactIds;
