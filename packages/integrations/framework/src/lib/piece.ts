import { Trigger } from './trigger/trigger';
import { Tool } from './action/action';
import {
  EventPayload,
  ParseEventResponse,
  PieceCategory,
} from '@inboxfm-connect/core-piece-types';
import { IntegrationBase, IntegrationMetadata} from './piece-metadata';
import { IntegrationAuthProperty } from './property/authentication';
import { ServerContext } from './context';
import { ContextVersion, LATEST_CONTEXT_VERSION, MINIMUM_SUPPORTED_RELEASE_AFTER_LATEST_CONTEXT_VERSION } from './context/versioning';

export class Integration<IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined = IntegrationAuthProperty>
  implements Omit<IntegrationBase, 'version' | 'name'>
{
  private readonly _tools: Record<string, Tool> = {};
  private readonly _triggers: Record<string, Trigger> = {};
  public getContextInfo: (() => { version: ContextVersion } )| undefined = () => ({ version: LATEST_CONTEXT_VERSION });
  
  constructor(
    public readonly displayName: string,
    public readonly logoUrl: string,
    public readonly authors: string[],
    public readonly events: IntegrationEventProcessors | undefined,
    tools: Tool[],
    triggers: Trigger[],
    public readonly categories: PieceCategory[],
    public readonly auth?: IntegrationAuth,
    public readonly minimumSupportedRelease: string = MINIMUM_SUPPORTED_RELEASE_AFTER_LATEST_CONTEXT_VERSION,
    public readonly maximumSupportedRelease?: string,
    public readonly description = '',
  ) {
    if (!isValidSimpleSemver(minimumSupportedRelease) || isSemverLessThan(minimumSupportedRelease, MINIMUM_SUPPORTED_RELEASE_AFTER_LATEST_CONTEXT_VERSION)) {
      this.minimumSupportedRelease = MINIMUM_SUPPORTED_RELEASE_AFTER_LATEST_CONTEXT_VERSION;
    }
    tools.forEach((tool) => (this._tools[tool.name] = tool));
    triggers.forEach((trigger) => (this._triggers[trigger.name] = trigger));
  }

  metadata(): BackwardCompatibleIntegrationMetadata {
    return {
      displayName: this.displayName,
      logoUrl: this.logoUrl,
      actions: this._tools,
      triggers: this._triggers,
      categories: this.categories,
      description: this.description,
      authors: this.authors,
      auth: this.auth,
      minimumSupportedRelease: this.minimumSupportedRelease,
      maximumSupportedRelease: this.maximumSupportedRelease,
      contextInfo: this.getContextInfo?.()
    };
  }

  getAction(toolName: string): Tool | undefined {
    return this._tools[toolName];
  }

  getTrigger(triggerName: string): Trigger | undefined {
    return this._triggers[triggerName];
  }

  actions() {
    return this._tools;
  }

  triggers() {
    return this._triggers;
  }
}

export const createIntegration = <IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined>(
  params: CreateIntegrationParams<IntegrationAuth>
) => {
  if(params.auth && Array.isArray(params.auth)) { 
    const isUnique = params.auth.every((auth, index, self) =>
      index === self.findIndex((t) => t.type === auth.type)
    );
    if(!isUnique) {
     throw new Error('Auth properties must be unique by type');
    }
  }
  return new Integration<IntegrationAuth>(
    params.displayName,
    params.logoUrl,
    params.authors ?? [],
    params.events,
    params.tools ?? params.actions ?? [],
    params.triggers ?? [],
    params.categories ?? [],
    params.auth,
    params.minimumSupportedRelease,
    params.maximumSupportedRelease,
    params.description,
  );
};

export type CreateIntegrationParams<
  IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined = undefined
> = {
  displayName: string;
  logoUrl: string;
  authors: string[];
  description?: string;
  auth: IntegrationAuth | undefined;
  events?: IntegrationEventProcessors;
  minimumSupportedRelease?: string;
  maximumSupportedRelease?: string;
  tools?: Tool[];
  actions?: Tool[]; // backward compatible alias
  triggers?: Trigger[];
  categories?: PieceCategory[];
};

type IntegrationEventProcessors = {
  parseAndReply: (ctx: { payload: EventPayload, server: Omit<ServerContext, 'token' | 'apiUrl'> }) => ParseEventResponse;
  verify: (ctx: {
    webhookSecret: string | Record<string, string>;
    payload: EventPayload;
    appWebhookUrl: string;
  }) => boolean;
};

type BackwardCompatibleIntegrationMetadata = Omit<IntegrationMetadata, 'name' | 'version' | 'authors' | 'i18n' | 'getContextInfo'> & {
  authors?: IntegrationMetadata['authors']
  i18n?: IntegrationMetadata['i18n']
}

function isValidSimpleSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function isSemverLessThan(a: string, b: string): boolean {
  const [a1, a2, a3] = a.split('.').map(Number);
  const [b1, b2, b3] = b.split('.').map(Number);
  if (a1 !== b1) return a1 < b1;
  if (a2 !== b2) return a2 < b2;
  return a3 < b3;
}
