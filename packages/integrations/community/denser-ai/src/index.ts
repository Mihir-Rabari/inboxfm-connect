import { createPiece, PieceAuth } from '@inboxfm-connect/pieces-framework';
import { denserAiAuth } from './lib/common/auth';
import { PieceCategory } from '@inboxfm-connect/pieces-framework';
import { processInputText } from './lib/actions/process-input-text';

export const denserAi = createPiece({
  displayName: 'Denser.ai',
  auth: denserAiAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/denser-ai.png',
  categories: [PieceCategory.ARTIFICIAL_INTELLIGENCE],
  authors: ['sanket-a11y'],
  actions: [processInputText],
  triggers: [],
});

