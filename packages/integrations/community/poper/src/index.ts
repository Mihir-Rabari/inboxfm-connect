import { createPiece, PieceAuth } from '@inboxfm-connect/pieces-framework';
import { newLead } from './lib/triggers/new-lead';
import { PieceCategory } from '@inboxfm-connect/pieces-framework';

export const poper = createPiece({
  displayName: 'Poper',
  auth: PieceAuth.None(),
  minimumSupportedRelease: '0.30.0',
  categories: [PieceCategory.MARKETING],
  description:
    'AI Driven Pop-up Builder that can convert visitors into customers,increase subscriber count, and skyrocket sales.',
  logoUrl: 'https://cdn.activepieces.com/pieces/poper.png',
  authors: ['thirstycode'],
  actions: [],
  triggers: [newLead],
});
