import { defineTestApp } from "convex-test";
import { defineSchema, defineTable, httpRouter } from "convex/server";
import { v } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import componentTest from "../test.js";
import { polarProduct, polarSubscription, WEBHOOK_SECRET, webhookBody } from "./fixtures.test.helpers.js";
import { Polar, PolarError, signWebhook, vWebhookEvent } from "./index.js";

const app = defineTestApp({
  schema: defineSchema({
    // What the app's onEvent handler saw, to check it runs once per delivery.
    events: defineTable({
      type: v.string(),
      status: v.union(v.string(), v.null()),
      product: v.union(v.string(), v.null()),
      payloadType: v.string()
    })
  }),
  components: { polar: componentTest }
});

const polar = new Polar(app.components.polar, { accessToken: "polar_oat_test", webhookSecret: WEBHOOK_SECRET });
const http = httpRouter();

const { api, internal, createTest } = app.defineModules({
  http: { default: http },
  events: {
    record: app.internalMutation({
      args: vWebhookEvent,
      handler: async (ctx, { type, payload, subscription, product }) => {
        const payloadType = (JSON.parse(payload) as { type: string }).type;
        await ctx.db.insert("events", {
          type,
          status: subscription?.status ?? null,
          product: product?.name ?? null,
          payloadType
        });
      }
    }),
    list: app.query({ args: {}, handler: async (ctx) => await ctx.db.query("events").collect() })
  },
  billing: {
    subscriptions: app.query({
      args: { referenceId: v.string() },
      handler: async (ctx, args) => await polar.listSubscriptions(ctx, args)
    }),
    products: app.query({
      args: { includeArchived: v.optional(v.boolean()) },
      handler: async (ctx, args) => await polar.listProducts(ctx, args)
    }),
    switchToYearly: app.action({
      args: { subscriptionId: v.string() },
      handler: async (ctx, { subscriptionId }) =>
        await polar.changeProduct(ctx, { subscriptionId, productId: "prod_year", prorationBehavior: "prorate" })
    }),
    revoke: app.action({
      args: { subscriptionId: v.string() },
      handler: async (ctx, { subscriptionId }) => await polar.revokeSubscription(ctx, { subscriptionId })
    }),
    syncProducts: app.action({ args: {}, handler: async (ctx) => await polar.syncProducts(ctx) }),
    syncSubscriptions: app.action({ args: {}, handler: async (ctx) => await polar.syncSubscriptions(ctx) })
  }
});
polar.registerRoutes(http, { onEvent: internal.events.record });

type Test = ReturnType<typeof createTest>;

async function deliver(t: Test, type: string, data: unknown, id?: string, secret = WEBHOOK_SECRET) {
  const body = webhookBody(type, data);
  return await t.fetch("/polar/events", { method: "POST", headers: await signWebhook(body, secret, { id }), body });
}

/** Stubs Polar's API with one answer per call, in order. */
function stubPolar(...answers: { status: number; json: unknown }[]) {
  const fetch = vi.fn(async (_url: URL, _init: RequestInit) => {
    const { status, json } = answers.length > 1 ? answers.shift()! : answers[0];
    return new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const page = (items: unknown[], maxPage: number) => ({
  status: 200,
  json: { items, pagination: { total_count: items.length, max_page: maxPage } }
});

beforeEach(() => vi.useFakeTimers({ now: new Date("2026-11-13T09:00:00Z") }));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("webhooks", () => {
  test("mirror a subscription and run onEvent once per delivery", async () => {
    const t = createTest();
    expect((await deliver(t, "subscription.created", polarSubscription(), "msg_1")).status).toBe(202);
    // Polar redelivers the same message: nothing runs twice.
    expect((await deliver(t, "subscription.created", polarSubscription(), "msg_1")).status).toBe(202);

    const [subscription] = await t.query(api.billing.subscriptions, { referenceId: "team_1" });
    expect(subscription).toMatchObject({ id: "sub_1", status: "active", productId: "prod_month" });
    expect(await t.query(api.events.list, {})).toMatchObject([
      { type: "subscription.created", status: "active", payloadType: "subscription.created" }
    ]);
  });

  test("subscriptions are found by the checkout's reference, not the paying customer", async () => {
    const t = createTest();
    // One owner (customer team_1) pays for two shops.
    await deliver(t, "subscription.created", polarSubscription({ id: "sub_a", metadata: { referenceId: "shop_a" } }));
    await deliver(t, "subscription.created", polarSubscription({ id: "sub_b", metadata: { referenceId: "shop_b" } }));
    expect((await t.query(api.billing.subscriptions, { referenceId: "shop_a" })).map((s) => s.id)).toEqual(["sub_a"]);
    expect((await t.query(api.billing.subscriptions, { referenceId: "shop_b" })).map((s) => s.id)).toEqual(["sub_b"]);
    expect(await t.query(api.billing.subscriptions, { referenceId: "team_1" })).toEqual([]);
  });

  test("an older event delivered late doesn't roll the mirror back", async () => {
    const t = createTest();
    await deliver(t, "subscription.canceled", polarSubscription({ status: "canceled", modified_at: "2026-11-05T00:00:00Z" }));
    await deliver(t, "subscription.updated", polarSubscription({ status: "active", modified_at: "2026-11-02T00:00:00Z" }));

    const subscriptions = await t.query(api.billing.subscriptions, { referenceId: "team_1" });
    expect(subscriptions.map((s) => s.status)).toEqual(["canceled"]);
    // onEvent sees the mirrored state, not the stale event's.
    expect((await t.query(api.events.list, {})).map((e) => e.status)).toEqual(["canceled", "canceled"]);
  });

  test("product events update the product mirror", async () => {
    const t = createTest();
    await deliver(t, "product.created", polarProduct());
    await deliver(t, "product.updated", polarProduct({ name: "Pro", modified_at: "2026-10-02T00:00:00Z" }));
    await deliver(t, "product.created", polarProduct({ id: "prod_old", is_archived: true }));
    expect((await t.query(api.billing.products, {})).map((p) => p.name)).toEqual(["Pro"]);
    expect(await t.query(api.billing.products, { includeArchived: true })).toHaveLength(2);
    expect((await t.query(api.events.list, {})).map((e) => e.product)).toEqual(["Pro · Monthly", "Pro", "Pro · Monthly"]);
  });

  test("other events reach onEvent without a subscription or product", async () => {
    const t = createTest();
    expect((await deliver(t, "order.paid", { id: "order_1" })).status).toBe(202);
    expect(await t.query(api.events.list, {})).toMatchObject([{ type: "order.paid", status: null, product: null }]);
  });

  test("a delivery that isn't signed with the secret is refused and changes nothing", async () => {
    const t = createTest();
    const response = await deliver(t, "subscription.created", polarSubscription(), undefined, `whsec_${btoa("nope")}`);
    expect(response.status).toBe(403);
    expect(await t.query(api.billing.subscriptions, { referenceId: "team_1" })).toEqual([]);
    expect(await t.query(api.events.list, {})).toEqual([]);
  });

  test("data the parser can't read fails the delivery, so Polar retries it", async () => {
    const t = createTest();
    await expect(deliver(t, "subscription.updated", polarSubscription({ status: "frozen" }))).rejects.toThrow(
      'Unexpected status "frozen"'
    );
    expect(await t.query(api.events.list, {})).toEqual([]);
  });

  test("delivery ids are forgotten after 30 days", async () => {
    const t = createTest();
    await deliver(t, "order.paid", { id: "order_1" }, "msg_old");
    vi.advanceTimersByTime(31 * 24 * 60 * 60 * 1000);
    // This delivery prunes the old id, so the same id counts as new again.
    await deliver(t, "order.paid", { id: "order_2" }, "msg_new");
    await deliver(t, "order.paid", { id: "order_1" }, "msg_old");
    expect((await t.query(api.events.list, {})).length).toBe(3);
  });
});

describe("API calls", () => {
  test("a checkout keeps the reference in its metadata, pinned to the API version", async () => {
    const fetch = stubPolar({ status: 201, json: { id: "chk_1", url: "https://sandbox.polar.sh/checkout/chk_1" } });
    const checkout = await polar.createCheckout({
      products: ["prod_month"],
      referenceId: "shop_1",
      externalCustomerId: "user_1",
      customerEmail: "owner@example.com",
      metadata: { plan: "pro" },
      successUrl: "https://app.example.com/billing?success=true",
      trial: { interval: "day", count: 7 }
    });
    expect(checkout).toEqual({ id: "chk_1", url: "https://sandbox.polar.sh/checkout/chk_1" });

    const [url, init] = fetch.mock.calls[0];
    expect(String(url)).toBe("https://sandbox-api.polar.sh/v1/checkouts/");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer polar_oat_test", "Polar-Version": "2026-10" });
    expect(JSON.parse(init.body as string)).toEqual({
      products: ["prod_month"],
      external_customer_id: "user_1",
      customer_email: "owner@example.com",
      success_url: "https://app.example.com/billing?success=true",
      metadata: { plan: "pro", referenceId: "shop_1" },
      trial_interval: "day",
      trial_interval_count: 7
    });
  });

  test("the portal opens for a Polar customer id or an external id", async () => {
    const fetch = stubPolar({ status: 201, json: { customer_portal_url: "https://polar.sh/portal/1" } });
    expect(await polar.createCustomerPortalUrl({ customerId: "cus_1", returnUrl: "https://app.example.com" })).toBe(
      "https://polar.sh/portal/1"
    );
    await polar.createCustomerPortalUrl({ externalCustomerId: "user_1" });
    expect(fetch.mock.calls.map(([, init]) => JSON.parse(init.body as string))).toEqual([
      { customer_id: "cus_1", return_url: "https://app.example.com" },
      { external_customer_id: "user_1" }
    ]);
  });

  test("changing the product mirrors the subscription Polar returns", async () => {
    const t = createTest();
    const fetch = stubPolar({ status: 200, json: polarSubscription({ product_id: "prod_year", recurring_interval: "year" }) });
    const updated = await t.action(api.billing.switchToYearly, { subscriptionId: "sub_1" });
    expect(updated).toMatchObject({ productId: "prod_year", recurringInterval: "year" });
    expect(String(fetch.mock.calls[0][0])).toBe("https://sandbox-api.polar.sh/v1/subscriptions/sub_1");
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toEqual({
      product_id: "prod_year",
      proration_behavior: "prorate"
    });
    const [mirrored] = await t.query(api.billing.subscriptions, { referenceId: "team_1" });
    expect(mirrored.productId).toBe("prod_year");
  });

  test("revoking ends the subscription now and mirrors it", async () => {
    const t = createTest();
    const fetch = stubPolar({ status: 200, json: polarSubscription({ status: "canceled", ended_at: "2026-11-13T09:00:00Z" }) });
    await t.action(api.billing.revoke, { subscriptionId: "sub_1" });
    expect(fetch.mock.calls[0][1].method).toBe("DELETE");
    expect(fetch.mock.calls[0][1].body).toBeUndefined();
    const [mirrored] = await t.query(api.billing.subscriptions, { referenceId: "team_1" });
    expect(mirrored).toMatchObject({ status: "canceled", endedAt: Date.parse("2026-11-13T09:00:00Z") });
  });

  test("syncing copies every page of products and subscriptions into the mirror", async () => {
    const t = createTest();
    const fetch = stubPolar(
      page([polarProduct({ id: "prod_month" })], 2),
      page([polarProduct({ id: "prod_year", name: "Pro · Yearly" })], 2)
    );
    expect(await t.action(api.billing.syncProducts, {})).toBe(2);
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      "https://sandbox-api.polar.sh/v1/products/?page=1&limit=100",
      "https://sandbox-api.polar.sh/v1/products/?page=2&limit=100"
    ]);
    expect((await t.query(api.billing.products, {})).map((p) => p.id).sort()).toEqual(["prod_month", "prod_year"]);

    stubPolar(page([polarSubscription({ metadata: { referenceId: "shop_1" } })], 1));
    expect(await t.action(api.billing.syncSubscriptions, {})).toBe(1);
    expect(await t.query(api.billing.subscriptions, { referenceId: "shop_1" })).toHaveLength(1);
  });

  test("an error answer becomes a PolarError with Polar's detail", async () => {
    stubPolar({ status: 422, json: { detail: [{ loc: ["body", "products"], msg: "Field required", type: "missing" }] } });
    const error = await polar.createCustomerPortalUrl({ customerId: "cus_1" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PolarError);
    expect(error).toMatchObject({
      status: 422,
      message: "Polar POST /v1/customer-sessions/ failed with 422: products: Field required"
    });
  });

  test("query parameters are encoded, undefined ones left out", async () => {
    const fetch = stubPolar(page([], 1));
    await polar.request("GET", "/v1/products/", {
      query: { is_recurring: true, page: 1, organization_id: undefined, id: ["a", "b"] }
    });
    expect(String(fetch.mock.calls[0][0])).toBe(
      "https://sandbox-api.polar.sh/v1/products/?is_recurring=true&page=1&id=a&id=b"
    );
  });
});
