import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const loftyAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  description: 'API Key for Lofty',
  required: true,
});

