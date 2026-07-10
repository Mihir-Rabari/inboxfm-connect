import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const signrequestAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  description: 'Signrequest API Key',
  required: true,
});
