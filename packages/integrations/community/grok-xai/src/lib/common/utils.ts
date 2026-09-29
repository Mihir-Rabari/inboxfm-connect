import { AppConnectionValueForAuthProperty, Property } from '@inboxfm-connect/pieces-framework';
import { httpClient, HttpMethod, AuthenticationType } from '@inboxfm-connect/pieces-common';
import { encoding_for_model } from 'tiktoken';
import { XAI_BASE_URL } from './constants';
import { grokAuth } from './auth';

export interface XaiChoice {
  index: number;
  message: {
    role: string;
    content: string | null;
    reasoning_content?: string | null;
    refusal?: string | null;
    tool_calls?: any[];
  };
  finish_reason: string | null;
  logprobs?: any;
}

export interface XaiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: any;
  completion_tokens_details?: any;
  num_sources_used?: number;
}

export interface XaiResponse {
  body: {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: XaiChoice[];
    usage?: XaiUsage;
    citations?: string[];
    debug_output?: any;
    system_fingerprint?: string | null;
  };
}

export interface AskGrokResult {
  content: string | null;
  reasoning_content?: string | null;
  refusal?: string | null;
  role: string;
  finish_reason: string | null;
  index: number;
  model: string;
  id: string;
  created: number;
  object: string;
  system_fingerprint?: string | null;
  tool_calls?: any[];
  logprobs?: any;
  all_choices?: XaiChoice[];
  usage?: XaiUsage;
  citations?: string[];
  debug_output?: any;
}

export interface CategorizationResult {
  categories: any;
  reasoning: any;
  primary_category: any;
  multiple_categories?: boolean;
  total_categories_assigned: any;
  model: string;
  finish_reason: string | null;
  confidence_scores?: any;
  avg_confidence?: any;
  max_confidence?: any;
  min_confidence?: any;
  usage?: XaiUsage;
  citations?: string[];
  reasoning_content?: string | null;
}

export interface ExtractionResult {
  extracted_data: any;
  extraction_notes: any;
  extraction_success: any;
  fields_extracted: number;
  fields_requested: number;
  completion_rate: number;
  model: string;
  finish_reason: string | null;
  confidence_scores?: any;
  avg_confidence?: any;
  max_confidence?: any;
  min_confidence?: any;
  required_fields_found?: any;
  required_fields_missing?: any;
  usage?: XaiUsage;
  citations?: string[];
  reasoning_content?: string | null;
}

export const createModelProperty = (config?: {
  displayName?: string;
  description?: string;
  defaultValue?: string;
  filterForImages?: boolean;
}) => {
  const {
    displayName = 'Model',
    description = 'The Grok model to use.',
    defaultValue = 'grok-3-beta',
    filterForImages = false,
  } = config || {};

  const fallbackModels = filterForImages 
    ? [{ label: 'grok-2-image-1212', value: 'grok-2-image-1212' }]
    : [
        { label: 'grok-3-beta', value: 'grok-3-beta' },
        { label: 'grok-3-fast-beta', value: 'grok-3-fast-beta' },
        { label: 'grok-3-mini-beta', value: 'grok-3-mini-beta' },
      ];

  return Property.Dropdown({
    displayName,
    required: true,
    description,    
    refreshers: [],
    auth: grokAuth,
    defaultValue,
    options: async ({ auth }) => {
      if (!auth) {
        return {
          disabled: true,
          placeholder: 'Enter your API key first',
          options: [],
        };
      }

      try {
        const endpoint = filterForImages 
          ? `${XAI_BASE_URL}/image-generation-models`
          : `${XAI_BASE_URL}/language-models`;

        const response = await httpClient.sendRequest({
          url: endpoint,
          method: HttpMethod.GET,
          authentication: {
            type: AuthenticationType.BEARER_TOKEN,
            token: auth.secret_text,
          },
        });
        
        let models = [];
        if (filterForImages) {
          models = response.body.models || [];
        } else {
          models = response.body.models || [];
          models = models.filter((model: any) => 
            model.output_modalities?.includes('text') && 
            !model.output_modalities?.includes('image')
          );
        }
        
        return {
          disabled: false,
          options: models.map((model: any) => ({
            label: model.id,
            value: model.id,
          })),
        };
      } catch (error) {
        try {
          const response = await httpClient.sendRequest({
            url: `${XAI_BASE_URL}/models`,
            method: HttpMethod.GET,
            authentication: {
              type: AuthenticationType.BEARER_TOKEN,
              token: auth.secret_text,
            },
          });
          
          let models = response.body.data || [];
          
          if (filterForImages) {
            models = models.filter((model: any) => 
              model.id.includes('image') || model.id.includes('vision')
            );
          }
          
          return {
            disabled: false,
            options: models.map((model: any) => ({
              label: model.id,
              value: model.id,
            })),
          };
        } catch (fallbackError) {
          return {
            disabled: false,
            options: fallbackModels,
            placeholder: "Using fallback models",
          };
        }
      }
    },
  });
};

export const createTemperatureProperty = (defaultValue = 0.7) => 
  Property.Number({
    displayName: 'Temperature',
    required: false,
    description: 'Controls randomness (0-2): 0 = deterministic, 1 = balanced, 2 = creative.',
    defaultValue,
  });

export const createTokenProperty = (defaultValue?: number) => 
  Property.Number({
    displayName: 'Max Completion Tokens',
    required: false,
    description: 'Maximum tokens for the response.',
    defaultValue,
  });

export const createSearchProperties = () => ({
  enableContextSearch: Property.Checkbox({
    displayName: 'Enable Context Search',
    required: false,
    defaultValue: false,
    description: 'Allow the model to search for additional context.',
  }),
  includeCitations: Property.Checkbox({
    displayName: 'Include Citations',
    required: false,
    defaultValue: false,
    description: 'Include sources if context search is enabled.',
  }),
});

export const createAdvancedProperties = () => ({
  reasoningEffort: Property.StaticDropdown({
    displayName: 'Reasoning Effort',
    required: false,
    description: 'How thoroughly the model should analyze.',
    options: {
      disabled: false,
      options: [
        { label: 'Default', value: '' },
        { label: 'Low (Quick)', value: 'low' },
        { label: 'High (Deep)', value: 'high' },
      ],
    },
  }),
  user: Property.ShortText({
    displayName: 'User ID',
    required: false,
    description: 'Unique identifier for tracking.',
  }),
});

const handleXaiError = (error: any, operation: string): never => {
  if (error.response?.status === 400) {
    const errorMessage = error.response?.body?.error?.message || 'Bad request';
    throw new Error(`${operation} failed: ${errorMessage}`);
  }
  
  if (error.response?.status === 422) {
    const errorMessage = error.response?.body?.error?.message || 'Validation error';
    throw new Error(`Invalid ${operation.toLowerCase()} parameters: ${errorMessage}`);
  }

  if (error.response?.status === 429) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }

  if (error.response?.status === 500) {
    throw new Error(`${operation} service temporarily unavailable. Please try again.`);
  }

  if (error.response?.status === 401) {
    throw new Error('Invalid API key. Please check your xAI API key.');
  }

  if (error.response?.status === 403) {
    throw new Error('Access denied. Please check your API key permissions.');
  }

  if (error.message?.includes('timeout')) {
    throw new Error(`${operation} timed out. Try reducing complexity or text length.`);
  }

  throw new Error(`${operation} failed: ${error.message || 'Unknown error occurred'}`);
};

export const makeXaiRequest = async (
  {secret_text}: AppConnectionValueForAuthProperty<typeof grokAuth>,
  requestBody: any,
  timeout: number,
  operation: string
): Promise<XaiResponse> => {
  try {
    const response = await httpClient.sendRequest({
      method: HttpMethod.POST,
      url: `${XAI_BASE_URL}/chat/completions`,
      authentication: {
        type: AuthenticationType.BEARER_TOKEN,
        token: secret_text,
      },
      body: requestBody,
      timeout,
    });

    if (!response.body.choices || !Array.isArray(response.body.choices) || response.body.choices.length === 0) {
      throw new Error('Invalid response format: no choices returned');
    }

    return response as XaiResponse;
  } catch (error: any) {
    handleXaiError(error, operation);
    throw new Error('This should never be reached');
  }
};

export const validateResponse = (response: XaiResponse, operation: string) => {
  const choice = response.body.choices[0];
  const content = choice.message.content;

  if (!content) {
    throw new Error(`No ${operation.toLowerCase()} result received`);
  }

  return { choice, content };
};

export const parseJsonResponse = (content: string, operation: string) => {
  try {
    return JSON.parse(content);
  } catch (parseError) {
    throw new Error(`Failed to parse ${operation.toLowerCase()} result: ${parseError}`);
  }
}; 

// The stored chat history holds { role, content } message objects (see
// ask-grok.ts), not plain strings, so the estimator must read the message
// content. Estimating the whole object (e.g. via String(message).length)
// silently returns NaN and disables the context guard entirely.
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
  // keep cutting while the remaining history still exceeds the budget.
  let currentMessages = [...messages];
  while (
    currentMessages.length > 1 &&
    (await calculateMessagesTokenSize(currentMessages, model)) >
      maxTokens / 1.5 - rolesTokenLength
  ) {
    const cutoffSize = Math.max(1, Math.round(currentMessages.length * 0.1));
    currentMessages = currentMessages.slice(cutoffSize);
  }

  return currentMessages;
};

// The history budget is what the model can actually accept as input: its
// context window minus the completion budget, capped by the platform's 32k
// system limit, with the /1.1 safety margin. Previously a fixed message-count
// cap (30) alone bounded growth, so long chats still exceeded the model's
// context window regardless of actual token size.
export const historyBudget = (model: string, maxTokens: number): number => {
  const byModelWindow = (modelTokenLimit(model) - maxTokens) / 1.1;
  return Math.min(tokenLimit / 1.1, byModelWindow);
};

export const exceedsHistoryLimit = (
  tokenLength: number,
  model: string,
  maxTokens: number
) => {
  return tokenLength >= historyBudget(model, maxTokens);
};

export const tokenLimit = 32000;

// Context windows for the xAI models this piece's deployments run: grok-4
// carries a 1M-token window, the beta grok-3 line 256k, and the older fast
// mini 128k — aligned with the openai piece's sibling table conventions.
// Unknown models keep the conservative 2048 fallback so deployments we cannot
// resolve to a known model never over-admit history.
export const modelTokenLimit = (model: string): number => {
  switch (model) {
    case 'grok-4':
    case 'grok-4-fast':
    case 'grok-4-1':
    case 'grok-4.1':
      return 1000000;
    case 'grok-3-beta':
    case 'grok-3-fast-beta':
    case 'grok-3-mini-beta':
    case 'grok-3.1':
    case 'grok-3.2':
      return 256000;
    case 'grok-2-image-1212':
    case 'grok-2-vision-1212':
    case 'grok-3-mini':
      return 128000;
    default:
      return 2048;
  }
}; 
