import type { FunctionHandle } from "convex/server";
import { v } from "convex/values";
import { type MutationCtx, mutation } from "./_generated/server.js";
import { upsertSubscription } from "./subscriptions.js";
import { vSubscription } from "./validators.js";

// Polar retries a failed delivery up to 10 times with exponential backoff;
// a delivery id is remembered well past the last retry.
export const WEBHOOK_EVENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Expired ids deleted per delivery: more than arrive, so the table stays bounded.
const PRUNE_BATCH = 10;

/**
 * Handles one verified webhook delivery (the client checked its signature):
 * mirrors the subscription it carries, then runs the app's `onEvent` handler,
 * all in one transaction. A delivery seen before changes nothing.
 */
export const ingest = mutation({
  args: {
    webhookId: v.string(),
    type: v.string(),
    subscription: v.union(vSubscription, v.null()),
    // The raw event, passed on to `onEvent`; only sent when there is one.
    payload: v.optional(v.string()),
    // A function handle for the app's mutation.
    onEvent: v.optional(v.string())
  },
  returns: v.union(v.literal("processed"), v.literal("duplicate")),
  handler: async (ctx, { webhookId, type, subscription, payload, onEvent }) => {
    const seen = await ctx.db
      .query("webhookEvents")
      .withIndex("by_webhookId", (q) => q.eq("webhookId", webhookId))
      .unique();
    if (seen) return "duplicate";
    await ctx.db.insert("webhookEvents", { webhookId });
    await pruneWebhookEvents(ctx);

    if (subscription) await upsertSubscription(ctx, subscription);
    if (onEvent) {
      // The mirrored state, not the event's: an out-of-order event is older.
      const mirrored = subscription ? await currentState(ctx, subscription.id) : null;
      await ctx.runMutation(onEvent as FunctionHandle<"mutation">, {
        type,
        payload: payload ?? "",
        subscription: mirrored
      });
    }
    return "processed";
  }
});

async function currentState(ctx: MutationCtx, id: string) {
  const row = await ctx.db
    .query("subscriptions")
    .withIndex("by_polarId", (q) => q.eq("id", id))
    .unique();
  if (!row) return null;
  const { _id, _creationTime, ...subscription } = row;
  return subscription;
}

async function pruneWebhookEvents(ctx: MutationCtx): Promise<void> {
  const cutoff = Date.now() - WEBHOOK_EVENT_TTL_MS;
  const expired = await ctx.db
    .query("webhookEvents")
    .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
    .take(PRUNE_BATCH);
  for (const row of expired) await ctx.db.delete("webhookEvents", row._id);
}
