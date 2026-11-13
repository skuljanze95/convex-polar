import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { type MutationCtx, mutation, query } from "./_generated/server.js";
import { type Subscription, vSubscription } from "./validators.js";

// A customer has a handful of subscriptions at most; this only bounds the read.
const MAX_PER_CUSTOMER = 100;

function withoutSystemFields({ _id, _creationTime, ...subscription }: Doc<"subscriptions">): Subscription {
  return subscription;
}

/** A subscription by its Polar id, or null if none is mirrored. */
export const get = query({
  args: { id: v.string() },
  returns: v.union(vSubscription, v.null()),
  handler: async (ctx, { id }) => {
    const row = await ctx.db
      .query("subscriptions")
      .withIndex("by_polarId", (q) => q.eq("id", id))
      .unique();
    return row ? withoutSystemFields(row) : null;
  }
});

/** A customer's subscriptions, by the customer's external id, newest first. */
export const listByExternalCustomer = query({
  args: { externalCustomerId: v.string() },
  returns: v.array(vSubscription),
  handler: async (ctx, { externalCustomerId }) => {
    const rows = await ctx.db
      .query("subscriptions")
      .withIndex("by_externalCustomerId", (q) => q.eq("externalCustomerId", externalCustomerId))
      .order("desc")
      .take(MAX_PER_CUSTOMER);
    return rows.map(withoutSystemFields);
  }
});

/**
 * Mirrors a subscription Polar returned. Returns false when the mirror already
 * has a newer state of it (Polar delivers webhooks out of order), which it keeps.
 */
export const upsert = mutation({
  args: { subscription: vSubscription },
  returns: v.boolean(),
  handler: (ctx, { subscription }) => upsertSubscription(ctx, subscription)
});

export async function upsertSubscription(ctx: MutationCtx, subscription: Subscription): Promise<boolean> {
  const existing = await ctx.db
    .query("subscriptions")
    .withIndex("by_polarId", (q) => q.eq("id", subscription.id))
    .unique();
  if (!existing) {
    await ctx.db.insert("subscriptions", subscription);
    return true;
  }
  if (changedAt(existing) > changedAt(subscription)) return false;
  await ctx.db.replace("subscriptions", existing._id, subscription);
  return true;
}

function changedAt(subscription: Subscription): number {
  return subscription.modifiedAt ?? subscription.createdAt;
}
