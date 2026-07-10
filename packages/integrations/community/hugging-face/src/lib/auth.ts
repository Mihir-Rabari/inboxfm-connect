import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const huggingFaceAuth = PieceAuth.SecretText({
  displayName: 'API Token',
  description:
    'Your Hugging Face API token (get it from https://huggingface.co/settings/tokens)',
  required: true,
});

