import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const justInvoiceAuth = PieceAuth.SecretText({
  displayName: 'API Key',
  description: 'Enter your JustInvoice API key. You can find this in your JustInvoice account settings.',
  required: true,
});

