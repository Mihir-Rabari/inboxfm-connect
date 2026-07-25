import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const zooAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  required: true,
  description: 'Your Zoo API Key (Bearer Token).',
});
