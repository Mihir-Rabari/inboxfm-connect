import { PieceAuth } from "@inboxfm-connect/pieces-framework";
import { httpClient, HttpMethod } from "@inboxfm-connect/pieces-common";

export const qwilrAuth = PieceAuth.SecretText({
    displayName: 'API Key',
    required: true,
    description: `
    1. Go to your Qwilr account settings.
    2. Navigate to API Settings.
    3. Copy your access token.`,
})
