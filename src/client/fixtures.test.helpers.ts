// A Polar `Subscription` (API version 2026-10) as its webhooks and API return
// it, trimmed to what the parser reads plus a few fields it ignores.
export function polarSubscription(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "sub_1",
    created_at: "2026-11-01T10:00:00.000Z",
    modified_at: "2026-11-01T10:05:00.000Z",
    amount: 1000,
    currency: "eur",
    recurring_interval: "month",
    recurring_interval_count: 1,
    status: "active",
    current_period_start: "2026-11-01T10:00:00.000Z",
    current_period_end: "2026-12-01T10:00:00.000Z",
    current_meter_period_start: null,
    current_meter_period_end: null,
    trial_start: null,
    trial_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
    started_at: "2026-11-01T10:00:00.000Z",
    ends_at: null,
    ended_at: null,
    customer_id: "cus_1",
    product_id: "prod_month",
    discount_id: null,
    checkout_id: "chk_1",
    metadata: { plan: "pro" },
    customer: {
      id: "cus_1",
      external_id: "team_1",
      email: "owner@example.com",
      metadata: {}
    },
    product: { id: "prod_month", name: "Pro · Monthly" },
    prices: [],
    meters: [],
    pending_update: null,
    ...overrides
  };
}

// A Polar `Product` (API version 2026-10), trimmed the same way.
export function polarProduct(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "prod_month",
    created_at: "2026-10-01T00:00:00.000Z",
    modified_at: null,
    trial_interval: null,
    trial_interval_count: null,
    name: "Pro · Monthly",
    description: null,
    visibility: "public",
    recurring_interval: "month",
    recurring_interval_count: 1,
    is_recurring: true,
    is_archived: false,
    organization_id: "org_1",
    metadata: { interval: "month" },
    prices: [
      {
        id: "price_1",
        created_at: "2026-10-01T00:00:00.000Z",
        modified_at: null,
        source: "catalog",
        amount_type: "fixed",
        price_currency: "eur",
        tax_behavior: null,
        is_archived: false,
        product_id: "prod_month",
        price_amount: 1000
      }
    ],
    benefits: [],
    medias: [],
    ...overrides
  };
}

export function webhookBody(type: string, data: unknown): string {
  return JSON.stringify({ type, timestamp: new Date().toISOString(), api_version: "2026-10", data });
}

/** A Standard Webhooks secret, as Polar's dashboard shows it. */
export const WEBHOOK_SECRET = `whsec_${btoa("a test signing key, 32 bytes long")}`;
