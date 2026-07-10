import { BasePropertySchema, TPropertyValue } from "../common";
import { DropdownState } from "./common";
import { ConnectionValueForAuthProperty, PropertyContext } from "../../../context";
import * as z from "zod/mini";
import { PropertyType } from "../property-type";
import { IntegrationAuthProperty } from "../../authentication";

type DynamicDropdownOptions<T, IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] |  undefined = undefined> = (
  propsValue: Record<string, unknown> & {
    auth?: IntegrationAuth extends undefined ? undefined : ConnectionValueForAuthProperty<Exclude<IntegrationAuth, undefined>>;
  },
  ctx: PropertyContext,
) => Promise<DropdownState<T>>;

export const DropdownProperty = z.object({
  ...BasePropertySchema.shape,
  ...TPropertyValue(z.unknown(), PropertyType.DROPDOWN).shape,
  refreshers: z.array(z.string()),
});

export type DropdownProperty<T, R extends boolean, IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] |  undefined = undefined> = BasePropertySchema & {
  /**
   * A dummy property used to infer {@code IntegrationAuth} type
   */
  auth: IntegrationAuth;
  refreshers: string[];
  refreshOnSearch?: boolean;
  options: DynamicDropdownOptions<T, IntegrationAuth>;
} & TPropertyValue<T, PropertyType.DROPDOWN, R>;


export const MultiSelectDropdownProperty = z.object({
  ...BasePropertySchema.shape,
  ...TPropertyValue(z.array(z.unknown()), PropertyType.MULTI_SELECT_DROPDOWN).shape,
  refreshers: z.array(z.string()),
});

export type MultiSelectDropdownProperty<
  T,
  R extends boolean,
  IntegrationAuth extends IntegrationAuthProperty | IntegrationAuthProperty[] | undefined = undefined
> = BasePropertySchema & {
  /**
   * A dummy property used to infer {@code IntegrationAuth} type
   */
  auth: IntegrationAuth;
  refreshers: string[];
  refreshOnSearch?: boolean;
  options: DynamicDropdownOptions<T, IntegrationAuth>;
} & TPropertyValue<
  T[],
  PropertyType.MULTI_SELECT_DROPDOWN,
  R
>;
