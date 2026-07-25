import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const personalAiAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  description: 'API Key for authentication',
  required: true,
})
