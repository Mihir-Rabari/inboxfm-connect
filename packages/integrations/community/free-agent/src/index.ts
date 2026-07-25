import { createPiece, PieceAuth } from "@inboxfm-connect/pieces-framework";
import { AuthenticationType, httpClient, HttpMethod } from '@inboxfm-connect/pieces-common';
import { PieceCategory } from '@inboxfm-connect/pieces-framework';
import { freeAgentCreateTask } from './lib/actions/create-task';
import { freeAgentCreateContact } from './lib/actions/create-contact';
import { freeAgentNewInvoiceTrigger } from './lib/triggers/new-invoice';
import { freeAgentNewContactTrigger } from './lib/triggers/new-contact';
import { freeAgentNewUserTrigger } from './lib/triggers/new-user';
import { freeAgentNewTaskTrigger } from './lib/triggers/new-task';
import { freeAgentAuth } from './lib/auth';

export const freeAgent = createPiece({
  displayName: "FreeAgent",
  description: "Accounting and invoicing software for small businesses",
  auth: freeAgentAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: "https://cdn.activepieces.com/pieces/free-agent.png",
  authors: ['onyedikachi-david'],
  categories: [PieceCategory.ACCOUNTING],
  actions: [freeAgentCreateTask, freeAgentCreateContact],
  triggers: [freeAgentNewInvoiceTrigger, freeAgentNewContactTrigger, freeAgentNewUserTrigger, freeAgentNewTaskTrigger],
});

