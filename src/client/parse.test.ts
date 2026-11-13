import { expect, test } from "vitest";
import { polarProduct, polarSubscription } from "./fixtures.test.helpers.js";
import { PolarParseError, parseProduct, parseSubscription } from "./parse.js";

test("reads a Polar subscription into the mirrored shape", () => {
  expect(parseSubscription(polarSubscription())).toEqual({
    id: "sub_1",
    referenceId: "team_1",
    customerId: "cus_1",
    externalCustomerId: "team_1",
    productId: "prod_month",
    status: "active",
    amount: 1000,
    currency: "eur",
    recurringInterval: "month",
    recurringIntervalCount: 1,
    currentPeriodStart: Date.parse("2026-11-01T10:00:00.000Z"),
    currentPeriodEnd: Date.parse("2026-12-01T10:00:00.000Z"),
    trialStart: null,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    startedAt: Date.parse("2026-11-01T10:00:00.000Z"),
    endsAt: null,
    endedAt: null,
    metadata: { plan: "pro" },
    createdAt: Date.parse("2026-11-01T10:00:00.000Z"),
    modifiedAt: Date.parse("2026-11-01T10:05:00.000Z")
  });
});

test("the reference id is the checkout's, else the customer's external id", () => {
  const forShop = parseSubscription(polarSubscription({ metadata: { referenceId: "shop_2" } }));
  expect(forShop).toMatchObject({ referenceId: "shop_2", externalCustomerId: "team_1" });

  const anonymous = parseSubscription(polarSubscription({ customer: { id: "cus_1", external_id: null } }));
  expect(anonymous).toMatchObject({ referenceId: null, externalCustomerId: null });
});

test("reads a Polar product with its prices", () => {
  expect(parseProduct(polarProduct())).toEqual({
    id: "prod_month",
    name: "Pro · Monthly",
    description: null,
    isRecurring: true,
    isArchived: false,
    recurringInterval: "month",
    recurringIntervalCount: 1,
    trialInterval: null,
    trialIntervalCount: null,
    metadata: { interval: "month" },
    prices: [{ id: "price_1", amountType: "fixed", priceCurrency: "eur", priceAmount: 1000, isArchived: false }],
    createdAt: Date.parse("2026-10-01T00:00:00.000Z"),
    modifiedAt: null
  });
  const custom = parseProduct(
    polarProduct({ prices: [{ id: "p", amount_type: "custom", price_currency: "usd", is_archived: false }] })
  );
  expect(custom.prices[0]).toMatchObject({ amountType: "custom", priceAmount: null });
});

test("leaves out metadata keys Convex can't store", () => {
  const subscription = parseSubscription(
    polarSubscription({ metadata: { plan: "pro", _internal: "x", $ref: "y", "č": "z", seats: 3, trial: true } })
  );
  expect(subscription.metadata).toEqual({ plan: "pro", seats: 3, trial: true });
});

test("names the field when Polar's shape isn't the expected one", () => {
  expect(() => parseSubscription(polarSubscription({ current_period_end: undefined }))).toThrow(
    new PolarParseError("Expected current_period_end to be a string")
  );
  expect(() => parseSubscription(polarSubscription({ status: "frozen" }))).toThrow('Unexpected status "frozen"');
  expect(() => parseSubscription(polarSubscription({ created_at: "soon" }))).toThrow(
    "Expected created_at to be a date"
  );
  expect(() => parseSubscription(null)).toThrow("Expected subscription to be an object");
});
