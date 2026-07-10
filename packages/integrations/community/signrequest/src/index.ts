import { createPiece } from '@inboxfm-connect/pieces-framework';
import { signrequestAuth } from './lib/common/auth';
import { PieceCategory } from '@inboxfm-connect/pieces-framework';
import { sendSignrequest } from './lib/actions/send-signrequest';
import { createCustomApiCallAction } from '@inboxfm-connect/pieces-common';

export const signrequest = createPiece({
  displayName: 'Signrequest',
  auth: signrequestAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/signrequest.png',
  categories: [PieceCategory.SALES_AND_CRM],
  authors: ['sanket-a11y'],
  actions: [
    sendSignrequest,
    createCustomApiCallAction({
      auth: signrequestAuth,
      baseUrl: () => 'https://signrequest.com/api/v1',
      authMapping: async (auth) => {
        return {
          Authorization: auth.secret_text,
        };
      },
    }),
  ],
  triggers: [],
});
