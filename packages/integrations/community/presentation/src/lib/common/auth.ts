import { PieceAuth } from '@inboxfm-connect/pieces-framework';
import { makeRequest } from './client';
import { HttpMethod } from '@inboxfm-connect/pieces-common';

export const presentonAuth = PieceAuth.SecretText({
  displayName: 'Presenton API Key',
  description: `
`,
  required: true,
  validate: async ({ auth }) => {
    if (auth) {
      try {
        await makeRequest(
          auth as string,
          HttpMethod.GET,
          '/ppt/presentation/all',
          {}
        );
        return {
          valid: true,
        };
      } catch (error) {
        return {
          valid: false,
          error: 'Invalid Api Key',
        };
      }
    }
    return {
      valid: false,
      error: 'Invalid Api Key',
    };
  },
});
