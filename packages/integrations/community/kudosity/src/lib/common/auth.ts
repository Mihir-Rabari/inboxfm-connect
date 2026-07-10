import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const kudosityAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  description: 'Kudosity API Key',
  required: true,
});

