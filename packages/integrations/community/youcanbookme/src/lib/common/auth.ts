import { PieceAuth } from '@inboxfm-connect/pieces-framework';

export const youcanbookmeAuth = PieceAuth.SecretText({
  displayName: 'YouCanBookMe API Key',
  description: `
 Go to [app.youcanbookme.com](https://app.youcanbook.me/#/account/security/)
`,
  required: true,
});
