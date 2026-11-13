/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    products: {
      get: FunctionReference<
        "query",
        "internal",
        { id: string },
        {
          createdAt: number;
          description: string | null;
          id: string;
          isArchived: boolean;
          isRecurring: boolean;
          metadata: Record<string, string | number | boolean>;
          modifiedAt: number | null;
          name: string;
          prices: Array<{
            amountType: string;
            id: string;
            isArchived: boolean;
            priceAmount: number | null;
            priceCurrency: string;
          }>;
          recurringInterval: "day" | "week" | "month" | "year" | null;
          recurringIntervalCount: number | null;
          trialInterval: "day" | "week" | "month" | "year" | null;
          trialIntervalCount: number | null;
        } | null,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { includeArchived?: boolean },
        Array<{
          createdAt: number;
          description: string | null;
          id: string;
          isArchived: boolean;
          isRecurring: boolean;
          metadata: Record<string, string | number | boolean>;
          modifiedAt: number | null;
          name: string;
          prices: Array<{
            amountType: string;
            id: string;
            isArchived: boolean;
            priceAmount: number | null;
            priceCurrency: string;
          }>;
          recurringInterval: "day" | "week" | "month" | "year" | null;
          recurringIntervalCount: number | null;
          trialInterval: "day" | "week" | "month" | "year" | null;
          trialIntervalCount: number | null;
        }>,
        Name
      >;
      upsert: FunctionReference<
        "mutation",
        "internal",
        {
          products: Array<{
            createdAt: number;
            description: string | null;
            id: string;
            isArchived: boolean;
            isRecurring: boolean;
            metadata: Record<string, string | number | boolean>;
            modifiedAt: number | null;
            name: string;
            prices: Array<{
              amountType: string;
              id: string;
              isArchived: boolean;
              priceAmount: number | null;
              priceCurrency: string;
            }>;
            recurringInterval: "day" | "week" | "month" | "year" | null;
            recurringIntervalCount: number | null;
            trialInterval: "day" | "week" | "month" | "year" | null;
            trialIntervalCount: number | null;
          }>;
        },
        null,
        Name
      >;
    };
    subscriptions: {
      get: FunctionReference<
        "query",
        "internal",
        { id: string },
        {
          amount: number;
          cancelAtPeriodEnd: boolean;
          canceledAt: number | null;
          createdAt: number;
          currency: string;
          currentPeriodEnd: number;
          currentPeriodStart: number;
          customerId: string;
          endedAt: number | null;
          endsAt: number | null;
          externalCustomerId: string | null;
          id: string;
          metadata: Record<string, string | number | boolean>;
          modifiedAt: number | null;
          productId: string;
          recurringInterval: "day" | "week" | "month" | "year";
          recurringIntervalCount: number;
          referenceId: string | null;
          startedAt: number | null;
          status:
            | "incomplete"
            | "incomplete_expired"
            | "trialing"
            | "active"
            | "past_due"
            | "canceled"
            | "unpaid"
            | "paused";
          trialEnd: number | null;
          trialStart: number | null;
        } | null,
        Name
      >;
      listByReference: FunctionReference<
        "query",
        "internal",
        { referenceId: string },
        Array<{
          amount: number;
          cancelAtPeriodEnd: boolean;
          canceledAt: number | null;
          createdAt: number;
          currency: string;
          currentPeriodEnd: number;
          currentPeriodStart: number;
          customerId: string;
          endedAt: number | null;
          endsAt: number | null;
          externalCustomerId: string | null;
          id: string;
          metadata: Record<string, string | number | boolean>;
          modifiedAt: number | null;
          productId: string;
          recurringInterval: "day" | "week" | "month" | "year";
          recurringIntervalCount: number;
          referenceId: string | null;
          startedAt: number | null;
          status:
            | "incomplete"
            | "incomplete_expired"
            | "trialing"
            | "active"
            | "past_due"
            | "canceled"
            | "unpaid"
            | "paused";
          trialEnd: number | null;
          trialStart: number | null;
        }>,
        Name
      >;
      upsert: FunctionReference<
        "mutation",
        "internal",
        {
          subscriptions: Array<{
            amount: number;
            cancelAtPeriodEnd: boolean;
            canceledAt: number | null;
            createdAt: number;
            currency: string;
            currentPeriodEnd: number;
            currentPeriodStart: number;
            customerId: string;
            endedAt: number | null;
            endsAt: number | null;
            externalCustomerId: string | null;
            id: string;
            metadata: Record<string, string | number | boolean>;
            modifiedAt: number | null;
            productId: string;
            recurringInterval: "day" | "week" | "month" | "year";
            recurringIntervalCount: number;
            referenceId: string | null;
            startedAt: number | null;
            status:
              | "incomplete"
              | "incomplete_expired"
              | "trialing"
              | "active"
              | "past_due"
              | "canceled"
              | "unpaid"
              | "paused";
            trialEnd: number | null;
            trialStart: number | null;
          }>;
        },
        null,
        Name
      >;
    };
    webhooks: {
      ingest: FunctionReference<
        "mutation",
        "internal",
        {
          onEvent?: string;
          payload?: string;
          product?: {
            createdAt: number;
            description: string | null;
            id: string;
            isArchived: boolean;
            isRecurring: boolean;
            metadata: Record<string, string | number | boolean>;
            modifiedAt: number | null;
            name: string;
            prices: Array<{
              amountType: string;
              id: string;
              isArchived: boolean;
              priceAmount: number | null;
              priceCurrency: string;
            }>;
            recurringInterval: "day" | "week" | "month" | "year" | null;
            recurringIntervalCount: number | null;
            trialInterval: "day" | "week" | "month" | "year" | null;
            trialIntervalCount: number | null;
          } | null;
          subscription: {
            amount: number;
            cancelAtPeriodEnd: boolean;
            canceledAt: number | null;
            createdAt: number;
            currency: string;
            currentPeriodEnd: number;
            currentPeriodStart: number;
            customerId: string;
            endedAt: number | null;
            endsAt: number | null;
            externalCustomerId: string | null;
            id: string;
            metadata: Record<string, string | number | boolean>;
            modifiedAt: number | null;
            productId: string;
            recurringInterval: "day" | "week" | "month" | "year";
            recurringIntervalCount: number;
            referenceId: string | null;
            startedAt: number | null;
            status:
              | "incomplete"
              | "incomplete_expired"
              | "trialing"
              | "active"
              | "past_due"
              | "canceled"
              | "unpaid"
              | "paused";
            trialEnd: number | null;
            trialStart: number | null;
          } | null;
          type: string;
          webhookId: string;
        },
        "processed" | "duplicate",
        Name
      >;
    };
  };
