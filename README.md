# @skuljanze/convex-polar

[Polar](https://polar.sh) subscriptions for [Convex](https://convex.dev):
checkout, the customer portal, plan changes, and a mirror of every subscription
that Polar's webhooks keep current, so your queries can read who pays.

- **No Polar SDK.** It calls Polar's REST API with `fetch` and verifies webhooks
  with WebCrypto, so everything runs in Convex's default runtime (no
  `"use node"`), with no dependencies besides `convex`.
- **Pinned to one Polar API version** (`2026-10`). Every request sends
  `Polar-Version`, and every field read is checked, so a contract change fails
  loudly with the field's name instead of corrupting the mirror. Moving to a
  newer version is a release of this package.
- **Customers are your own ids.** Checkouts use Polar's external customer id,
  so a subscription is found by your user, team or business id. No customer
  table to keep in sync.
- **Webhooks run once.** Deliveries are deduplicated by `webhook-id`, events
  delivered out of order can't roll the mirror back, and your `onEvent` handler
  runs in the same transaction as the mirror update.

## Install

```sh
pnpm add @skuljanze/convex-polar
```

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import polar from "@skuljanze/convex-polar/convex.config";

const app = defineApp();
app.use(polar);
export default app;
```

Set the keys on your deployment:

```sh
npx convex env set POLAR_ACCESS_TOKEN polar_oat_…   # an organization access token
npx convex env set POLAR_WEBHOOK_SECRET whsec_…     # the webhook endpoint's secret
npx convex env set POLAR_SERVER production          # leave unset for sandbox
```

Create the client once. Its options are read on every call, so getters over
`process.env` (or your typed `env`) keep it current:

```ts
// convex/polar.ts
import { Polar } from "@skuljanze/convex-polar";
import { components } from "./_generated/api";

export const polar = new Polar(components.polar, {
  get accessToken() { return process.env.POLAR_ACCESS_TOKEN; },
  get webhookSecret() { return process.env.POLAR_WEBHOOK_SECRET; },
  get server() { return process.env.POLAR_SERVER as "sandbox" | "production" | undefined; },
});
```

Mount the webhook:

```ts
// convex/http.ts
import { httpRouter } from "convex/server";
import { polar } from "./polar";

const http = httpRouter();
polar.registerRoutes(http); // POST /polar/events
export default http;
```

In Polar's dashboard, add a webhook endpoint at
`https://<your-deployment>.convex.site/polar/events`, format **Raw**, API
version **2026-10**, with at least the `subscription.*` events.

## Use

Sell a product. The buyer's id becomes the Polar customer's external id:

```ts
export const subscribe = action({
  args: { productId: v.string() },
  handler: async (ctx, { productId }) => {
    const user = await requireUser(ctx); // your auth
    const { url } = await polar.createCheckout({
      products: [productId],
      externalCustomerId: user.id,
      customerEmail: user.email,
      // Polar reads the tax country from the IP that creates the checkout.
      customerIpAddress: (await ctx.meta.getRequestMetadata()).ip ?? undefined,
      successUrl: "https://app.example.com/billing?success=true",
    });
    return url;
  },
});
```

Read who pays, reactively, in any query or mutation:

```ts
const subscriptions = await polar.listSubscriptions(ctx, { externalCustomerId: user.id });
const paying = subscriptions.some((s) => s.status === "active" || s.status === "trialing");
```

Change or cancel, from an action. The mirror updates right away, before the
webhook confirms it:

```ts
await polar.changeProduct(ctx, { subscriptionId, productId: yearly, prorationBehavior: "prorate" });
await polar.setCancelAtPeriodEnd(ctx, { subscriptionId, cancelAtPeriodEnd: true });
const portalUrl = await polar.createCustomerPortalUrl({ externalCustomerId: user.id, returnUrl });
```

Anything else in Polar's API, with the token and pinned version (Polar's
snake_case shapes, see the [API reference](https://polar.sh/docs/api-reference)):

```ts
const products = await polar.request("GET", "/v1/products/", { query: { is_recurring: true } });
```

### Reacting to events

Pass a mutation to run for every event, once, in the same transaction as the
mirror update. It gets the event type, the raw JSON, and the subscription as
now mirrored (null for events that aren't about a subscription):

```ts
// convex/billing.ts
import { vWebhookEvent } from "@skuljanze/convex-polar";

export const onPolarEvent = internalMutation({
  args: vWebhookEvent,
  handler: async (ctx, { type, payload, subscription }) => {
    if (type === "subscription.created") { /* send a welcome email */ }
  },
});

// convex/http.ts
polar.registerRoutes(http, { onEvent: internal.billing.onPolarEvent });
```

If it throws, the delivery fails and Polar retries it.

## The subscription mirror

`listSubscriptions` and `getSubscription` return:

| Field | |
| --- | --- |
| `id`, `customerId`, `productId` | Polar ids |
| `externalCustomerId` | your id for the customer, or null if it has none |
| `status` | `incomplete`, `incomplete_expired`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `paused` |
| `amount`, `currency`, `recurringInterval`, `recurringIntervalCount` | the price |
| `currentPeriodStart`, `currentPeriodEnd` | the period paid for |
| `trialStart`, `trialEnd`, `startedAt`, `canceledAt`, `endsAt`, `endedAt` | or null |
| `cancelAtPeriodEnd` | set to end with the current period |
| `metadata` | from the checkout |
| `createdAt`, `modifiedAt` | when Polar made and last changed it |

Times are milliseconds since the epoch.

## Testing

Register the component in `convex-test`:

```ts
import polarTest from "@skuljanze/convex-polar/test";

const t = convexTest(schema, modules);
polarTest.register(t);
```

`signWebhook(body, secret)` signs a delivery the way Polar does, to test your
`onEvent` handler through `t.fetch("/polar/events", …)`.

## Polar API versions

Polar releases a new API version each quarter and removes the oldest, so each
version lives about nine months ([versioning](https://polar.sh/docs/api-reference/versioning)).
This package reads `2026-10` (`POLAR_API_VERSION`). When it moves to a newer
version, update the package and your webhook endpoint's version together.

## License

MIT
