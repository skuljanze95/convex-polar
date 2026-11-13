import { type Infer, v } from "convex/values";

// The shapes the component stores, from Polar API version 2026-10 (see
// POLAR_API_VERSION in src/client/api.ts). A stable version is frozen, so
// these change only when the package moves to a newer version.

export const vSubscriptionStatus = v.union(
  v.literal("incomplete"),
  v.literal("incomplete_expired"),
  v.literal("trialing"),
  v.literal("active"),
  v.literal("past_due"),
  v.literal("canceled"),
  v.literal("unpaid"),
  v.literal("paused")
);
export type SubscriptionStatus = Infer<typeof vSubscriptionStatus>;

export const vRecurringInterval = v.union(v.literal("day"), v.literal("week"), v.literal("month"), v.literal("year"));
export type RecurringInterval = Infer<typeof vRecurringInterval>;

export const vMetadata = v.record(v.string(), v.union(v.string(), v.number(), v.boolean()));
export type Metadata = Infer<typeof vMetadata>;

/**
 * A Polar subscription as the component mirrors it. Times are milliseconds
 * since the epoch. `externalCustomerId` is the customer's external id: the
 * app's own id for whoever pays (a user, a team, a business).
 */
export const vSubscription = v.object({
  id: v.string(),
  customerId: v.string(),
  externalCustomerId: v.union(v.string(), v.null()),
  productId: v.string(),
  status: vSubscriptionStatus,
  amount: v.number(),
  currency: v.string(),
  recurringInterval: vRecurringInterval,
  recurringIntervalCount: v.number(),
  currentPeriodStart: v.number(),
  currentPeriodEnd: v.number(),
  trialStart: v.union(v.number(), v.null()),
  trialEnd: v.union(v.number(), v.null()),
  // Set to end at the current period's end; Polar then reports it canceled.
  cancelAtPeriodEnd: v.boolean(),
  canceledAt: v.union(v.number(), v.null()),
  startedAt: v.union(v.number(), v.null()),
  // When it will end, once that's known.
  endsAt: v.union(v.number(), v.null()),
  // When it did end.
  endedAt: v.union(v.number(), v.null()),
  metadata: vMetadata,
  createdAt: v.number(),
  modifiedAt: v.union(v.number(), v.null())
});
export type Subscription = Infer<typeof vSubscription>;

/** What the app's `onEvent` mutation receives for every webhook event. */
export const vWebhookEvent = {
  /** Polar's event type, e.g. "subscription.updated" or "order.paid". */
  type: v.string(),
  /** The event as Polar sent it (JSON), for the fields the mirror doesn't keep. */
  payload: v.string(),
  /** The subscription it carries, as now mirrored; null for other events. */
  subscription: v.union(vSubscription, v.null())
};
