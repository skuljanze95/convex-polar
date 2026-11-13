import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vSubscription } from "./validators.js";

export default defineSchema({
  // Polar's subscriptions, mirrored from its webhooks and from the changes
  // made through the client. `id` is Polar's subscription id (indexed as
  // by_polarId: Convex reserves the name by_id).
  subscriptions: defineTable(vSubscription)
    .index("by_polarId", ["id"])
    .index("by_externalCustomerId", ["externalCustomerId"]),
  // The webhook deliveries already handled, by their `webhook-id`, so a
  // redelivery runs the app's handler once. Pruned after WEBHOOK_EVENT_TTL_MS.
  webhookEvents: defineTable({ webhookId: v.string() }).index("by_webhookId", ["webhookId"])
});
