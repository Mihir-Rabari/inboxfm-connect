import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const extractaAiAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Enter your Extracta-ai API key',
});

export type ExtractaAiAuth = string;

