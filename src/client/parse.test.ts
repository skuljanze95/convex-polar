import { expect, test } from "vitest";
import { polarSubscription } from "./fixtures.test.helpers.js";
import { PolarParseError, parseSubscription } from "./parse.js";

test("reads a Polar subscription into the mirrored shape", () => {
  expect(parseSubscription(polarSubscription())).toEqual({
    id: "sub_1",
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

test("a customer without an external id is mirrored with null", () => {
  const subscription = parseSubscription(polarSubscription({ customer: { id: "cus_1", external_id: null } }));
  expect(subscription.externalCustomerId).toBeNull();
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
