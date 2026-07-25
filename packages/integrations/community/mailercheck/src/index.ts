import { createPiece } from '@inboxfm-connect/pieces-framework';
import { mailercheckAuth } from './lib/common/auth';
import { verifyAnEmailAddress } from './lib/actions/verify-an-email-address';
import { PieceCategory } from '@inboxfm-connect/pieces-framework';
import { createCustomApiCallAction } from '@inboxfm-connect/pieces-common';

export const mailercheck = createPiece({
  displayName: 'Mailercheck',
  auth: mailercheckAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/mailercheck.png',
  categories: [PieceCategory.SALES_AND_CRM],
  description:
    'MailerCheck is an easy-to-use email and campaign analysis tool. Anyone using an email service provider can keep their email lists clean and their campaigns deliverable.',
  authors: ['sanket-a11y'],
  actions: [
    verifyAnEmailAddress,
    createCustomApiCallAction({
      auth: mailercheckAuth,
      baseUrl: () => 'https://app.mailercheck.com/api',
      authMapping: async (auth) => ({
        Authorization: `Bearer ${auth.secret_text}`,
      }),
    }),
  ],
  triggers: [],
});

