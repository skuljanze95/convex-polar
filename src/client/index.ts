import {
  createFunctionHandle,
  type FunctionReference,
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
  httpActionGeneric
} from "convex/server";
import type { ObjectType } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import type { Metadata, Product, RecurringInterval, Subscription, vWebhookEvent } from "../component/validators.js";
import { POLAR_API_VERSION, type PolarRequestInit, type PolarServer, polarRequest } from "./api.js";
import { parseProduct, parseSubscription, REFERENCE_ID_KEY } from "./parse.js";
import { verifyWebhook, WebhookVerificationError } from "./webhook.js";

export { POLAR_API_VERSION, PolarError, type PolarRequestInit, type PolarServer } from "./api.js";
export { PolarParseError, parseProduct, parseSubscription, REFERENCE_ID_KEY } from "./parse.js";
export { signWebhook, verifyWebhook, WebhookVerificationError } from "./webhook.js";
export {
  type Metadata,
  type Price,
  type Product,
  type RecurringInterval,
  type Subscription,
  type SubscriptionStatus,
  vMetadata,
  vPrice,
  vProduct,
  vRecurringInterval,
  vSubscription,
  vSubscriptionStatus,
  vWebhookEvent
} from "../component/validators.js";

/**
 * Where the client finds its keys. Read on every call, so the values can be
 * getters over the deployment's env (and tests can change them):
 *
 * ```ts
 * new Polar(components.polar, {
 *   get accessToken() { return process.env.POLAR_ORGANIZATION_TOKEN; },
 *   get webhookSecret() { return process.env.POLAR_WEBHOOK_SECRET; },
 *   get server() { return process.env.POLAR_SERVER as PolarServer | undefined; },
 * });
 * ```
 */
export type PolarOptions = {
  /** An organization access token. */
  accessToken: string | undefined;
  /** The webhook endpoint's `whsec_…` secret, for `registerRoutes`. */
  webhookSecret?: string | undefined;
  /** Defaults to "sandbox". */
  server?: PolarServer | undefined;
};

/** What the app's `onEvent` mutation receives; validate it with `vWebhookEvent`. */
export type WebhookEvent = ObjectType<typeof vWebhookEvent>;

export type CheckoutOptions = {
  /** The products offered, by Polar id; the first is selected. */
  products: string[];
  /**
   * What the subscription is for, in the app's own terms: a user, a team, a
   * shop. Kept in the subscription's metadata; `listSubscriptions` finds the
   * subscription by it.
   */
  referenceId: string;
  /**
   * The app's id for the person who pays, kept as the Polar customer's
   * external id when the checkout creates the customer. Polar matches
   * customers by email first, so a returning customer keeps the one they had.
   */
  externalCustomerId?: string;
  customerEmail?: string;
  customerName?: string;
  /**
   * The buyer's IP address. Polar reads the billing country (and so the tax)
   * from the IP that creates the checkout, which would otherwise be Convex's.
   */
  customerIpAddress?: string;
  /** Where Polar sends the buyer after paying. `{CHECKOUT_ID}` is filled in. */
  successUrl?: string;
  /** Where the checkout's back button goes. */
  returnUrl?: string;
  /** The origin of the page embedding the checkout, for Polar's embedded checkout. */
  embedOrigin?: string;
  /** Copied onto the order and the subscription, beside the reference id. */
  metadata?: Metadata;
  currency?: string;
  locale?: string;
  allowDiscountCodes?: boolean;
  /** A free trial before the first charge, replacing the product's own. */
  trial?: { interval: RecurringInterval; count: number };
};

export type ProrationBehavior = "invoice" | "prorate" | "next_period" | "reset";

// The narrowest signatures (an action's), which query, mutation and action
// contexts all satisfy.
type QueryCtx = Pick<GenericActionCtx<GenericDataModel>, "runQuery">;
type MutationCtx = Pick<GenericActionCtx<GenericDataModel>, "runMutation">;

// Polar's list pages; the largest page it serves.
type Page = { items: unknown[]; pagination: { max_page: number } };
const PAGE_SIZE = 100;

/**
 * Polar subscriptions for a Convex app: checkout, the customer portal, plan
 * changes, and a mirror of subscriptions and products that webhooks keep
 * current. Calls Polar's REST API directly, pinned to POLAR_API_VERSION, so
 * it runs in Convex's default runtime.
 */
export class Polar {
  constructor(
    readonly component: ComponentApi,
    private readonly options: PolarOptions
  ) {}

  /** Whether an access token is set: whether this deployment sells anything. */
  get isConfigured(): boolean {
    return Boolean(this.options.accessToken);
  }

  /**
   * Any Polar API call, with the token and the pinned API version. Shapes are
   * Polar's, in snake_case: https://polar.sh/docs/api-reference.
   */
  async request<T = unknown>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    init?: PolarRequestInit
  ): Promise<T> {
    const accessToken = this.options.accessToken;
    if (!accessToken) throw new Error("Polar: no access token is set.");
    return await polarRequest<T>({ accessToken, server: this.options.server ?? "sandbox" }, method, path, init);
  }

  /** Opens a checkout. Send the buyer to the returned `url`. */
  async createCheckout(options: CheckoutOptions): Promise<{ id: string; url: string }> {
    const checkout = await this.request<{ id: string; url: string }>("POST", "/v1/checkouts/", {
      body: {
        products: options.products,
        external_customer_id: options.externalCustomerId,
        customer_email: options.customerEmail,
        customer_name: options.customerName,
        customer_ip_address: options.customerIpAddress,
        success_url: options.successUrl,
        return_url: options.returnUrl,
        embed_origin: options.embedOrigin,
        metadata: { ...options.metadata, [REFERENCE_ID_KEY]: options.referenceId },
        currency: options.currency,
        locale: options.locale,
        allow_discount_codes: options.allowDiscountCodes,
        trial_interval: options.trial?.interval,
        trial_interval_count: options.trial?.count
      }
    });
    return { id: checkout.id, url: checkout.url };
  }

  /**
   * A link to Polar's customer portal (payment method, invoices, cancelling).
   * Pass the Polar `customerId` of a mirrored subscription, or the customer's
   * external id. The link works once and expires soon, so make one per visit.
   */
  async createCustomerPortalUrl(
    options: ({ customerId: string } | { externalCustomerId: string }) & { returnUrl?: string }
  ): Promise<string> {
    const customer =
      "customerId" in options
        ? { customer_id: options.customerId }
        : { external_customer_id: options.externalCustomerId };
    const session = await this.request<{ customer_portal_url: string }>("POST", "/v1/customer-sessions/", {
      body: { ...customer, return_url: options.returnUrl }
    });
    return session.customer_portal_url;
  }

  /** Moves a subscription to another product, e.g. monthly to yearly. */
  async changeProduct(
    ctx: MutationCtx,
    options: { subscriptionId: string; productId: string; prorationBehavior?: ProrationBehavior }
  ): Promise<Subscription> {
    return await this.updateSubscription(ctx, options.subscriptionId, "PATCH", {
      product_id: options.productId,
      proration_behavior: options.prorationBehavior
    });
  }

  /** Sets a subscription to end with its current period, or keeps it going again. */
  async setCancelAtPeriodEnd(
    ctx: MutationCtx,
    options: { subscriptionId: string; cancelAtPeriodEnd: boolean }
  ): Promise<Subscription> {
    return await this.updateSubscription(ctx, options.subscriptionId, "PATCH", {
      cancel_at_period_end: options.cancelAtPeriodEnd
    });
  }

  /** Ends a subscription now, without waiting for the period to end. */
  async revokeSubscription(ctx: MutationCtx, options: { subscriptionId: string }): Promise<Subscription> {
    return await this.updateSubscription(ctx, options.subscriptionId, "DELETE");
  }

  /** A reference's mirrored subscriptions, newest first. */
  async listSubscriptions(ctx: QueryCtx, options: { referenceId: string }): Promise<Subscription[]> {
    return await ctx.runQuery(this.component.subscriptions.listByReference, options);
  }

  /** A mirrored subscription by its Polar id. */
  async getSubscription(ctx: QueryCtx, options: { id: string }): Promise<Subscription | null> {
    return await ctx.runQuery(this.component.subscriptions.get, options);
  }

  /** The mirrored products, archived ones only when asked for. */
  async listProducts(ctx: QueryCtx, options: { includeArchived?: boolean } = {}): Promise<Product[]> {
    return await ctx.runQuery(this.component.products.list, options);
  }

  /** A mirrored product by its Polar id. */
  async getProduct(ctx: QueryCtx, options: { id: string }): Promise<Product | null> {
    return await ctx.runQuery(this.component.products.get, options);
  }

  /**
   * Copies every product of the organization from Polar into the mirror. Run
   * it once after installing (webhooks keep it current after that) and after
   * changing products outside the webhook's events. From an action.
   */
  async syncProducts(ctx: MutationCtx): Promise<number> {
    let count = 0;
    for await (const items of this.pages("/v1/products/")) {
      await ctx.runMutation(this.component.products.upsert, { products: items.map(parseProduct) });
      count += items.length;
    }
    return count;
  }

  /**
   * Copies the organization's subscriptions from Polar into the mirror, for
   * the ones that started before the webhook was set up. From an action.
   */
  async syncSubscriptions(ctx: MutationCtx): Promise<number> {
    let count = 0;
    for await (const items of this.pages("/v1/subscriptions/")) {
      await ctx.runMutation(this.component.subscriptions.upsert, { subscriptions: items.map(parseSubscription) });
      count += items.length;
    }
    return count;
  }

  /**
   * Mounts Polar's webhook at `path` (default "/polar/events"): checks the
   * signature with `webhookSecret`, mirrors the subscription and product
   * events, and runs `onEvent` for every event once, in the same transaction.
   * Point the Polar endpoint at `<CONVEX_SITE_URL><path>`, with the API
   * version POLAR_API_VERSION.
   */
  registerRoutes(
    http: HttpRouter,
    options: {
      path?: string;
      onEvent?: FunctionReference<"mutation", "internal", WebhookEvent>;
    } = {}
  ): void {
    http.route({
      path: options.path ?? "/polar/events",
      method: "POST",
      handler: httpActionGeneric(async (ctx, request) => {
        const secret = this.options.webhookSecret;
        if (!secret) {
          console.error("Polar webhook: no webhookSecret is set; the delivery is refused.");
          return new Response("Webhook secret not configured", { status: 500 });
        }
        const body = await request.text();
        try {
          await verifyWebhook(body, request.headers, secret);
        } catch (error) {
          if (error instanceof WebhookVerificationError) return new Response(error.message, { status: 403 });
          throw error;
        }

        let event: { type?: unknown; data?: unknown; api_version?: unknown };
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        if (typeof event.type !== "string") return new Response("Missing event type", { status: 400 });
        if (event.api_version !== POLAR_API_VERSION) {
          console.warn(
            `Polar webhook: the endpoint sends API version ${String(event.api_version)}, ` +
              `but this package reads ${POLAR_API_VERSION}. Set the endpoint's version in Polar's dashboard.`
          );
        }
        // Data the parser can't read throws: the delivery fails loudly and
        // Polar retries it, rather than the mirror going stale.
        const subscription = event.type.startsWith("subscription.") ? parseSubscription(event.data) : null;
        const product = event.type.startsWith("product.") ? parseProduct(event.data) : null;
        await ctx.runMutation(this.component.webhooks.ingest, {
          webhookId: request.headers.get("webhook-id") ?? "",
          type: event.type,
          subscription,
          product,
          ...(options.onEvent ? { payload: body, onEvent: await createFunctionHandle(options.onEvent) } : {})
        });
        return new Response(null, { status: 202 });
      })
    });
  }

  private async updateSubscription(
    ctx: MutationCtx,
    id: string,
    method: "PATCH" | "DELETE",
    body?: object
  ): Promise<Subscription> {
    const updated = parseSubscription(
      await this.request(method, `/v1/subscriptions/${encodeURIComponent(id)}`, body ? { body } : {})
    );
    // Mirrored now, so the app sees the change before the webhook arrives.
    await ctx.runMutation(this.component.subscriptions.upsert, { subscriptions: [updated] });
    return updated;
  }

  private async *pages(path: string): AsyncGenerator<unknown[]> {
    for (let page = 1; ; page += 1) {
      const result = await this.request<Page>("GET", path, { query: { page, limit: PAGE_SIZE } });
      yield result.items;
      if (page >= result.pagination.max_page) return;
    }
  }
}
