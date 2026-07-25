import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const flipandoAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  description: 'Flipando API Key',
  required: true,
});

