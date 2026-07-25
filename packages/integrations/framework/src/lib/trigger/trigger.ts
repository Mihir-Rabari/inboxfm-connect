import * as z from "zod/mini";
import { OnStartContext, TestOrRunHookContext, TriggerHookContext } from '../context';
import type { OutputSchema } from '../output-schema';
import { AiMetadata, TriggerBase } from '../piece-metadata';
import { IntegrationPropertyMap } from '../property';
import { ExtractIntegrationAuthPropertyTypeForMethods, IntegrationAuthProperty } from '../property/authentication';
import { isNil } from '@inboxfm-connect/core-utils';
import { TriggerStrategy, TriggerTestStrategy, WebhookHandshakeConfiguration, WebhookHandshakeStrategy } from '@inboxfm-connect/core-piece-types';
export { TriggerStrategy }

export const DEDUPE_KEY_PROPERTY = '_dedupe_key'

export enum WebhookRenewStrategy {
  CRON = 'CRON',
  NONE = 'NONE',
}

type OnStartRunner<IntegrationAuth extends IntegrationAuthProperty | undefined, TriggerProps extends IntegrationPropertyMap> = (ctx: OnStartContext<IntegrationAuth, TriggerProps>) => Promise<unknown | void>

export const WebhookRenewConfiguration = z.union([
  z.object({
    strategy: z.literal(WebhookRenewStrategy.CRON),
    cronExpression: z.string(),
  }),
  z.object({
    strategy: z.literal(WebhookRenewStrategy.NONE),
  }),
])
export type WebhookRenewConfiguration = z.infer<typeof WebhookRenewConfiguration>

export interface WebhookResponse {
  status: number,
  body?: unknown,
  headers?: Record<string, string>
}

type BaseTriggerParams<
  IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined,
  TriggerProps extends IntegrationPropertyMap,
  TS extends TriggerStrategy,
> = {
  name: string
  displayName: string
  description: string
  requireAuth?: boolean
  auth?: IntegrationAuth
  props: TriggerProps
  type: TS
  onEnable: (context: TriggerHookContext<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps, TS>) => Promise<void>
  onDisable: (context: TriggerHookContext<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps, TS>) => Promise<void>
  run: (context: TestOrRunHookContext<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps, TS>) => Promise<unknown[]>
  test?: (context: TestOrRunHookContext<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps, TS>) => Promise<unknown[]>,
  onStart?: OnStartRunner<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps>,
  sampleData: unknown
  outputSchema?: OutputSchema
  aiMetadata?: AiMetadata
}

type WebhookTriggerParams<
  IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined,
  TriggerProps extends IntegrationPropertyMap,
  TS extends TriggerStrategy,
> = BaseTriggerParams<IntegrationAuth, TriggerProps, TS> & {
  handshakeConfiguration?: WebhookHandshakeConfiguration
  onHandshake?: (context: TriggerHookContext<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps, TS>) => Promise<WebhookResponse>,
  renewConfiguration?: WebhookRenewConfiguration
  onRenew?(context: TriggerHookContext<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps, TS>): Promise<void>,
}

type CreateTriggerParams<
  IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined,
  TriggerProps extends IntegrationPropertyMap,
  TS extends TriggerStrategy,
> = TS extends TriggerStrategy.WEBHOOK
    ? WebhookTriggerParams<IntegrationAuth, TriggerProps, TS>
    : BaseTriggerParams<IntegrationAuth, TriggerProps, TS>

export class ITrigger<
  TS extends TriggerStrategy,
  IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined,
  TriggerProps extends IntegrationPropertyMap,
> implements TriggerBase {
  constructor(
    public readonly name: string,
    public readonly displayName: string,
    public readonly description: string,
    public readonly requireAuth: boolean,
    public readonly props: TriggerProps,
    public readonly type: TS,
    public readonly handshakeConfiguration: WebhookHandshakeConfiguration,
    public readonly onHandshake: (ctx: TriggerHookContext<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps, TS>) => Promise<WebhookResponse>,
    public readonly renewConfiguration: WebhookRenewConfiguration,
    public readonly onRenew: (ctx: TriggerHookContext<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps, TS>) => Promise<void>,
    public readonly onEnable: (ctx: TriggerHookContext<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps, TS>) => Promise<void>,
    public readonly onDisable: (ctx: TriggerHookContext<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps, TS>) => Promise<void>,
    public readonly onStart: OnStartRunner<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps>,
    public readonly run: (ctx: TestOrRunHookContext<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps, TS>) => Promise<unknown[]>,
    public readonly test: (ctx: TestOrRunHookContext<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, TriggerProps, TS>) => Promise<unknown[]>,
    public readonly sampleData: unknown,
    public readonly testStrategy: TriggerTestStrategy,
    public readonly outputSchema?: OutputSchema,
    public readonly aiMetadata?: AiMetadata,
  ) { }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Trigger<
  IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined = any,
  TriggerProps extends IntegrationPropertyMap = any,
  S extends TriggerStrategy = any,
> = ITrigger<S, IntegrationAuth, TriggerProps>

// TODO refactor and extract common logic
export const createTrigger = <
  TS extends TriggerStrategy,
  IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined ,
  TriggerProps extends IntegrationPropertyMap,
>(params: CreateTriggerParams<IntegrationAuth, TriggerProps, TS>) => {
  switch (params.type) {
    case TriggerStrategy.WEBHOOK:
      return new ITrigger(
        params.name,
        params.displayName,
        params.description,
        params.requireAuth ?? true,
        params.props,
        params.type,
        params.handshakeConfiguration ?? { strategy: WebhookHandshakeStrategy.NONE },
        params.onHandshake ?? (async () => ({ status: 200 })),
        params.renewConfiguration ?? { strategy: WebhookRenewStrategy.NONE },
        params.onRenew ?? (async () => Promise.resolve()),
        params.onEnable,
        params.onDisable,
        params.onStart ?? (async () => Promise.resolve()),
        params.run,
        params.test ?? (() => Promise.resolve([params.sampleData])),
        params.sampleData,
        params.test ? TriggerTestStrategy.TEST_FUNCTION : TriggerTestStrategy.SIMULATION,
        params.outputSchema,
        params.aiMetadata,
      )
    case TriggerStrategy.POLLING:
      return new ITrigger(
        params.name,
        params.displayName,
        params.description,
        params.requireAuth ?? true,
        params.props,
        params.type,
        { strategy: WebhookHandshakeStrategy.NONE },
        async () => ({ status: 200 }),
        { strategy: WebhookRenewStrategy.NONE },
        (async () => Promise.resolve()),
        params.onEnable,
        params.onDisable,
        params.onStart ?? (async () => Promise.resolve()),
        params.run,
        params.test ?? (() => Promise.resolve([params.sampleData])),
        params.sampleData,
        TriggerTestStrategy.TEST_FUNCTION,
        params.outputSchema,
        params.aiMetadata,
      )
    case TriggerStrategy.MANUAL:
      return new ITrigger(
        params.name,
        params.displayName,
        params.description,
        params.requireAuth ?? true,
        params.props,
        params.type,
        { strategy: WebhookHandshakeStrategy.NONE },
        async () => ({ status: 200 }),
        { strategy: WebhookRenewStrategy.NONE },
        (async () => Promise.resolve()),
        params.onEnable,
        params.onDisable,
        params.onStart ?? (async () => Promise.resolve()),
        params.run,
        params.test ?? (() => Promise.resolve([params.sampleData])),
        params.sampleData,
        TriggerTestStrategy.TEST_FUNCTION,
        params.outputSchema,
        params.aiMetadata,
      )
    case TriggerStrategy.APP_WEBHOOK:
      return new ITrigger(
        params.name,
        params.displayName,
        params.description,
        params.requireAuth ?? true,
        params.props,
        params.type,
        { strategy: WebhookHandshakeStrategy.NONE },
        async () => ({ status: 200 }),
        { strategy: WebhookRenewStrategy.NONE },
        (async () => Promise.resolve()),
        params.onEnable,
        params.onDisable,
        params.onStart ?? (async () => Promise.resolve()),
        params.run,
        params.test ?? (() => Promise.resolve([params.sampleData])),
        params.sampleData,
        (isNil(params.sampleData) && isNil(params.test)) ? TriggerTestStrategy.SIMULATION : TriggerTestStrategy.TEST_FUNCTION,
        params.outputSchema,
        params.aiMetadata,
      )
  }
}
