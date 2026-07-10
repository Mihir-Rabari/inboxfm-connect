import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const voucheryIoAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  description: 'Vouchery-io API Key',
  required: true,
});
