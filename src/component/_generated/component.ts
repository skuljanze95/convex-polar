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
      listByExternalCustomer: FunctionReference<
        "query",
        "internal",
        { externalCustomerId: string },
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
          };
        },
        boolean,
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
