import type {
  Metadata,
  Price,
  Product,
  RecurringInterval,
  Subscription,
  SubscriptionStatus
} from "../component/validators.js";

// Reads Polar's JSON (API version 2026-10) into the shapes the component
// stores. Only the fields the mirror keeps are read, and each is checked, so a
// change on Polar's side fails here with the field's name instead of later.

const STATUSES: readonly SubscriptionStatus[] = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused"
];
const INTERVALS: readonly RecurringInterval[] = ["day", "week", "month", "year"];

/** The metadata key `createCheckout` keeps the reference id under. */
export const REFERENCE_ID_KEY = "referenceId";

/** Polar sent something this version of the package doesn't understand. */
export class PolarParseError extends Error {
  override name = "PolarParseError";
}

/** A Polar `Subscription` object, as the component mirrors it. */
export function parseSubscription(value: unknown): Subscription {
  const data = object(value, "subscription");
  const customer = object(data.customer, "subscription.customer");
  const externalCustomerId = nullable(customer, "external_id", string);
  const meta = metadata(data.metadata);
  const reference = meta[REFERENCE_ID_KEY];
  return {
    id: string(data, "id"),
    referenceId: typeof reference === "string" && reference ? reference : externalCustomerId,
    customerId: string(data, "customer_id"),
    externalCustomerId,
    productId: string(data, "product_id"),
    status: oneOf(data, "status", STATUSES),
    amount: number(data, "amount"),
    currency: string(data, "currency"),
    recurringInterval: oneOf(data, "recurring_interval", INTERVALS),
    recurringIntervalCount: number(data, "recurring_interval_count"),
    currentPeriodStart: time(data, "current_period_start"),
    currentPeriodEnd: time(data, "current_period_end"),
    trialStart: nullable(data, "trial_start", time),
    trialEnd: nullable(data, "trial_end", time),
    cancelAtPeriodEnd: boolean(data, "cancel_at_period_end"),
    canceledAt: nullable(data, "canceled_at", time),
    startedAt: nullable(data, "started_at", time),
    endsAt: nullable(data, "ends_at", time),
    endedAt: nullable(data, "ended_at", time),
    metadata: meta,
    createdAt: time(data, "created_at"),
    modifiedAt: nullable(data, "modified_at", time)
  };
}

/** A Polar `Product` object, as the component mirrors it. */
export function parseProduct(value: unknown): Product {
  const data = object(value, "product");
  const prices = data.prices;
  if (!Array.isArray(prices)) throw new PolarParseError("Expected prices to be an array");
  return {
    id: string(data, "id"),
    name: string(data, "name"),
    description: nullable(data, "description", string),
    isRecurring: boolean(data, "is_recurring"),
    isArchived: boolean(data, "is_archived"),
    recurringInterval: nullable(data, "recurring_interval", (d, k) => oneOf(d, k, INTERVALS)),
    recurringIntervalCount: nullable(data, "recurring_interval_count", number),
    trialInterval: nullable(data, "trial_interval", (d, k) => oneOf(d, k, INTERVALS)),
    trialIntervalCount: nullable(data, "trial_interval_count", number),
    metadata: metadata(data.metadata),
    prices: prices.map(parsePrice),
    createdAt: time(data, "created_at"),
    modifiedAt: nullable(data, "modified_at", time)
  };
}

function parsePrice(value: unknown): Price {
  const data = object(value, "price");
  return {
    id: string(data, "id"),
    amountType: string(data, "amount_type"),
    priceCurrency: string(data, "price_currency"),
    priceAmount: nullable(data, "price_amount", number),
    isArchived: boolean(data, "is_archived")
  };
}

type Json = Record<string, unknown>;

function object(value: unknown, what: string): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PolarParseError(`Expected ${what} to be an object`);
  }
  return value as Json;
}

function string(data: Json, key: string): string {
  const value = data[key];
  if (typeof value !== "string") throw new PolarParseError(`Expected ${key} to be a string`);
  return value;
}

function number(data: Json, key: string): number {
  const value = data[key];
  if (typeof value !== "number") throw new PolarParseError(`Expected ${key} to be a number`);
  return value;
}

function boolean(data: Json, key: string): boolean {
  const value = data[key];
  if (typeof value !== "boolean") throw new PolarParseError(`Expected ${key} to be a boolean`);
  return value;
}

function time(data: Json, key: string): number {
  const ms = Date.parse(string(data, key));
  if (Number.isNaN(ms)) throw new PolarParseError(`Expected ${key} to be a date`);
  return ms;
}

function oneOf<T extends string>(data: Json, key: string, values: readonly T[]): T {
  const value = string(data, key);
  if (!values.includes(value as T)) throw new PolarParseError(`Unexpected ${key} "${value}"`);
  return value as T;
}

function nullable<T>(data: Json, key: string, read: (data: Json, key: string) => T): T | null {
  return data[key] === null || data[key] === undefined ? null : read(data, key);
}

/**
 * Polar's metadata, without the entries Convex can't store: keys must be
 * non-empty ASCII and not start with "$" or "_".
 */
function metadata(value: unknown): Metadata {
  if (value === null || value === undefined) return {};
  const result: Metadata = {};
  for (const [key, item] of Object.entries(object(value, "metadata"))) {
    if (!/^[\x20-\x7e]+$/.test(key) || key.startsWith("$") || key.startsWith("_")) continue;
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") result[key] = item;
  }
  return result;
}
