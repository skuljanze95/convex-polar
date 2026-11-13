import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vProduct, vSubscription } from "./validators.js";

export default defineSchema({
  // Polar's subscriptions, mirrored from its webhooks and from the changes
  // made through the client. `id` is Polar's id (indexed as by_polarId:
  // Convex reserves the name by_id).
  subscriptions: defineTable(vSubscription)
    .index("by_polarId", ["id"])
    .index("by_referenceId", ["referenceId"]),
  // Polar's products, mirrored from its webhooks and from syncProducts.
  products: defineTable(vProduct).index("by_polarId", ["id"]),
  // The webhook deliveries already handled, by their `webhook-id`, so a
  // redelivery runs the app's handler once. Pruned after WEBHOOK_EVENT_TTL_MS.
  webhookEvents: defineTable({ webhookId: v.string() }).index("by_webhookId", ["webhookId"])
});
