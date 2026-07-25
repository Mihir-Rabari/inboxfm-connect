import * as z from "zod/mini";
import { ToolContext } from '../context';
import type { OutputSchema } from '../output-schema';
import { ToolBase, Audience, AiMetadata } from '../piece-metadata';
import { IntegrationPropertyMap } from '../property';
import { ExtractIntegrationAuthPropertyTypeForMethods, IntegrationAuthProperty } from '../property/authentication';

export type ToolRunner<IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined = IntegrationAuthProperty, ToolProps extends IntegrationPropertyMap = IntegrationPropertyMap> =
  (ctx: ToolContext<IntegrationAuth, ToolProps>) => Promise<unknown | void>

export const ErrorHandlingOptionsParam = z.object({
  retryOnFailure: z.object({
    defaultValue: z.optional(z.boolean()),
    hide: z.optional(z.boolean()),
  }),
  continueOnFailure: z.object({
    defaultValue: z.optional(z.boolean()),
    hide: z.optional(z.boolean()),
  }),
})
export type ErrorHandlingOptionsParam = z.infer<typeof ErrorHandlingOptionsParam>

type CreateToolParams<IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined, ToolProps extends IntegrationPropertyMap> = {
  /**
   * A dummy parameter used to infer {@code IntegrationAuth} type
   */
  name: string
  /**
   * this parameter is used to infer the type of the piece auth value in run and test methods
   */
  auth?: IntegrationAuth
  displayName: string
  description: string
  props: ToolProps
  run: ToolRunner<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, ToolProps>
  test?: ToolRunner<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, ToolProps>
  requireAuth?: boolean
  errorHandlingOptions?: ErrorHandlingOptionsParam
  outputSchema?: OutputSchema
  audience?: Audience
  aiMetadata?: AiMetadata
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class ITool<IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined = any, ToolProps extends IntegrationPropertyMap = IntegrationPropertyMap> implements ToolBase {
  constructor(
    public readonly name: string,
    public readonly displayName: string,
    public readonly description: string,
    public readonly props: ToolProps,
    public readonly run: ToolRunner<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, ToolProps>,
    public readonly test: ToolRunner<ExtractIntegrationAuthPropertyTypeForMethods<IntegrationAuth>, ToolProps>,
    public readonly requireAuth: boolean,
    public readonly errorHandlingOptions: ErrorHandlingOptionsParam,
    public readonly outputSchema?: OutputSchema,
    public readonly audience?: Audience,
    public readonly aiMetadata?: AiMetadata,
  ) { }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tool<
  IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined = any,
  ToolProps extends IntegrationPropertyMap = any,
> = ITool<IntegrationAuth, ToolProps>

export const createTool = <
  IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined = IntegrationAuthProperty,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ToolProps extends IntegrationPropertyMap = any
>(
  params: CreateToolParams<IntegrationAuth, ToolProps>,
) => {
  return new ITool(
    params.name,
    params.displayName,
    params.description,
    params.props,
    params.run,
    params.test ?? params.run,
    params.requireAuth ?? true,
    params.errorHandlingOptions ?? {
      continueOnFailure: {
        defaultValue: false,
      },
      retryOnFailure: {
        defaultValue: false,
      }
    },
    params.outputSchema,
    params.audience,
    params.aiMetadata,
  )
}
