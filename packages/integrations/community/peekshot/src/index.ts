import { createPiece, PieceAuth } from '@inboxfm-connect/pieces-framework';
import { captureScreenshot } from './lib/actions/capture-screenshot';
import { PieceCategory } from '@inboxfm-connect/pieces-framework';
import {
  createCustomApiCallAction,
  httpClient,
  HttpMethod,
} from '@inboxfm-connect/pieces-common';
import { peekshotAuth } from './lib/auth';

export const peekshot = createPiece({
  displayName: 'PeekShot',
  auth: peekshotAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/peekshot.png',
  categories: [PieceCategory.PRODUCTIVITY],
  authors: ['balwant1707'],
  actions: [
    captureScreenshot,
    createCustomApiCallAction({
      auth: peekshotAuth,
      baseUrl: () => 'https://api.peekshot.com/api/v1',
      authMapping: async (auth) => {
        return {
          'x-api-key': auth.secret_text,
        };
      },
    }),
  ],
  triggers: [],
});
