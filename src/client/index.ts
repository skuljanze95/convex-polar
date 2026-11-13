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
import type { Metadata, RecurringInterval, Subscription, vWebhookEvent } from "../component/validators.js";
import { POLAR_API_VERSION, type PolarRequestInit, type PolarServer, polarRequest } from "./api.js";
import { parseSubscription } from "./parse.js";
import { verifyWebhook, WebhookVerificationError } from "./webhook.js";

export { POLAR_API_VERSION, PolarError, type PolarRequestInit, type PolarServer } from "./api.js";
export { PolarParseError, parseSubscription } from "./parse.js";
export { signWebhook, verifyWebhook, WebhookVerificationError } from "./webhook.js";
export {
  type Metadata,
  type RecurringInterval,
  type Subscription,
  type SubscriptionStatus,
  vMetadata,
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
 *   get accessToken() { return env.POLAR_ACCESS_TOKEN; },
 *   get webhookSecret() { return env.POLAR_WEBHOOK_SECRET; },
 *   get server() { return env.POLAR_SERVER; },
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
   * The app's own id for whoever pays. Polar keeps it as the customer's
   * external id, creating the customer on the first checkout, and every
   * subscription of that customer is mirrored under it.
   */
  externalCustomerId: string;
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
  /** Copied onto the order and the subscription. */
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

/**
 * Polar subscriptions for a Convex app: checkout, the customer portal, plan
 * changes, and a mirror of every subscription that webhooks keep current.
 * Calls Polar's REST API directly, pinned to POLAR_API_VERSION, so it runs in
 * Convex's default runtime.
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
        metadata: options.metadata,
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
   * A link to Polar's customer portal (payment method, invoices, cancelling)
   * for a customer who has bought before. It works once and expires soon, so
   * make one per visit.
   */
  async createCustomerPortalUrl(options: { externalCustomerId: string; returnUrl?: string }): Promise<string> {
    const session = await this.request<{ customer_portal_url: string }>("POST", "/v1/customer-sessions/", {
      body: { external_customer_id: options.externalCustomerId, return_url: options.returnUrl }
    });
    return session.customer_portal_url;
  }

  /** Moves a subscription to another product, e.g. monthly to yearly. */
  async changeProduct(
    ctx: MutationCtx,
    options: { subscriptionId: string; productId: string; prorationBehavior?: ProrationBehavior }
  ): Promise<Subscription> {
    return await this.updateSubscription(ctx, options.subscriptionId, {
      product_id: options.productId,
      proration_behavior: options.prorationBehavior
    });
  }

  /** Sets a subscription to end with its current period, or keeps it going again. */
  async setCancelAtPeriodEnd(
    ctx: MutationCtx,
    options: { subscriptionId: string; cancelAtPeriodEnd: boolean }
  ): Promise<Subscription> {
    return await this.updateSubscription(ctx, options.subscriptionId, {
      cancel_at_period_end: options.cancelAtPeriodEnd
    });
  }

  /** A customer's mirrored subscriptions, by external id, newest first. */
  async listSubscriptions(ctx: QueryCtx, options: { externalCustomerId: string }): Promise<Subscription[]> {
    return await ctx.runQuery(this.component.subscriptions.listByExternalCustomer, options);
  }

  /** A mirrored subscription by its Polar id. */
  async getSubscription(ctx: QueryCtx, options: { id: string }): Promise<Subscription | null> {
    return await ctx.runQuery(this.component.subscriptions.get, options);
  }

  /**
   * Mounts Polar's webhook at `path` (default "/polar/events"): checks the
   * signature with `webhookSecret`, mirrors the subscription events, and runs
   * `onEvent` for every event once, in the same transaction. Point the Polar
   * endpoint at `<CONVEX_SITE_URL><path>`, with the API version POLAR_API_VERSION.
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
        // A subscription the parser can't read throws: the delivery fails
        // loudly and Polar retries it, rather than the mirror going stale.
        const subscription = event.type.startsWith("subscription.") ? parseSubscription(event.data) : null;
        await ctx.runMutation(this.component.webhooks.ingest, {
          webhookId: request.headers.get("webhook-id") ?? "",
          type: event.type,
          subscription,
          ...(options.onEvent ? { payload: body, onEvent: await createFunctionHandle(options.onEvent) } : {})
        });
        return new Response(null, { status: 202 });
      })
    });
  }

  private async updateSubscription(ctx: MutationCtx, id: string, body: object): Promise<Subscription> {
    const updated = parseSubscription(
      await this.request("PATCH", `/v1/subscriptions/${encodeURIComponent(id)}`, { body })
    );
    // Mirrored now, so the app sees the change before the webhook arrives.
    await ctx.runMutation(this.component.subscriptions.upsert, { subscription: updated });
    return updated;
  }
}
