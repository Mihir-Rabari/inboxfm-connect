import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const digitalPilotAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  description: 'Enter your DigitalPilot API key',
  required: true,
});

