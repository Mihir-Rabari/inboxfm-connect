import { PieceAuth } from '@inboxfm-connect/pieces-framework';
import { OAuth2GrantType } from '@inboxfm-connect/pieces-framework';

export const lightfunnelsAuth = PieceAuth.OAuth2({
  grantType: OAuth2GrantType.AUTHORIZATION_CODE,
  authUrl: 'https://app.lightfunnels.com/admin/oauth',
  tokenUrl: 'https://services.lightfunnels.com/oauth/access',
  required: true,
  scope: ['products,orders,customers,funnels'],
});

