import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const heymarketSmsAuth = PieceAuth.SecretText({
  displayName: 'Heymarket API Key',
  description:
    'Enter your Heymarket API Key. You can find it in your Heymarket account settings.',
  required: true,
});

