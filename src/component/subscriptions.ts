import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server.js";
import { type Subscription, vSubscription } from "./validators.js";

// A reference has a handful of subscriptions at most; this only bounds the read.
const MAX_PER_REFERENCE = 100;

function withoutSystemFields({ _id, _creationTime, ...subscription }: Doc<"subscriptions">): Subscription {
  return subscription;
}

/** A subscription by its Polar id, or null if none is mirrored. */
export const get = query({
  args: { id: v.string() },
  returns: v.union(vSubscription, v.null()),
  handler: (ctx, { id }) => getSubscription(ctx, id)
});

/** A reference's subscriptions, newest first. */
export const listByReference = query({
  args: { referenceId: v.string() },
  returns: v.array(vSubscription),
  handler: async (ctx, { referenceId }) => {
    const rows = await ctx.db
      .query("subscriptions")
      .withIndex("by_referenceId", (q) => q.eq("referenceId", referenceId))
      .order("desc")
      .take(MAX_PER_REFERENCE);
    return rows.map(withoutSystemFields);
  }
});

/**
 * Mirrors subscriptions Polar returned. Each is kept unless the mirror already
 * has a newer state of it (Polar delivers webhooks out of order).
 */
export const upsert = mutation({
  args: { subscriptions: v.array(vSubscription) },
  returns: v.null(),
  handler: async (ctx, { subscriptions }) => {
    for (const subscription of subscriptions) await upsertSubscription(ctx, subscription);
    return null;
  }
});

export async function getSubscription(ctx: QueryCtx, id: string): Promise<Subscription | null> {
  const row = await ctx.db
    .query("subscriptions")
    .withIndex("by_polarId", (q) => q.eq("id", id))
    .unique();
  return row ? withoutSystemFields(row) : null;
}

export async function upsertSubscription(ctx: MutationCtx, subscription: Subscription): Promise<void> {
  const existing = await ctx.db
    .query("subscriptions")
    .withIndex("by_polarId", (q) => q.eq("id", subscription.id))
    .unique();
  if (!existing) {
    await ctx.db.insert("subscriptions", subscription);
  } else if (changedAt(existing) <= changedAt(subscription)) {
    await ctx.db.replace("subscriptions", existing._id, subscription);
  }
}

function changedAt(subscription: Subscription): number {
  return subscription.modifiedAt ?? subscription.createdAt;
}
