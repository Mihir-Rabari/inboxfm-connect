import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const esignaturesAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  description: 'Esignatures API Key',
  required: true,
});

