# @skuljanze/convex-polar

[Polar](https://polar.sh) subscriptions for [Convex](https://convex.dev):
checkout, the customer portal, plan changes, and mirrors of your subscriptions
and products that Polar's webhooks keep current, so your queries can read who
pays and what it costs.

- **No Polar SDK.** It calls Polar's REST API with `fetch` and verifies webhooks
  with WebCrypto, so everything runs in Convex's default runtime (no
  `"use node"`), with no dependencies besides `convex`.
- **Pinned to one Polar API version** (`2026-10`). Every request sends
  `Polar-Version`, and every field read is checked, so a contract change fails
  loudly with the field's name instead of corrupting the mirror. Moving to a
  newer version is a release of this package.
- **Subscriptions are found by your own ids.** A checkout carries a
  `referenceId` (your user, team or shop id), Polar copies it onto the
  subscription, and the mirror is indexed by it. Polar keeps one customer per
  email, so one person can pay for several of your references.
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
npx convex env set POLAR_ORGANIZATION_TOKEN polar_oat_…   # an organization access token
npx convex env set POLAR_WEBHOOK_SECRET whsec_…           # the webhook endpoint's secret
npx convex env set POLAR_SERVER production                # leave unset for sandbox
```

Create the client once. Its options are read on every call, so getters over
`process.env` (or your typed `env`) keep it current:

```ts
// convex/polar.ts
import { Polar, type PolarServer } from "@skuljanze/convex-polar";
import { components } from "./_generated/api";

export const polar = new Polar(components.polar, {
  get accessToken() { return process.env.POLAR_ORGANIZATION_TOKEN; },
  get webhookSecret() { return process.env.POLAR_WEBHOOK_SECRET; },
  get server() { return process.env.POLAR_SERVER as PolarServer | undefined; },
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
version **2026-10**, with the `subscription.*` events (and `product.*` to keep
the product mirror current). Then fill the mirrors once, from an action:

```ts
export const syncPolar = internalAction({
  args: {},
  handler: async (ctx) => {
    await polar.syncProducts(ctx);
    await polar.syncSubscriptions(ctx);
  },
});
```

## Use

Sell a product. `referenceId` is what the subscription is for:

```ts
export const subscribe = action({
  args: { productId: v.string() },
  handler: async (ctx, { productId }) => {
    const user = await requireUser(ctx); // your auth
    const { url } = await polar.createCheckout({
      products: [productId],
      referenceId: user.id, // or the team, shop, … being paid for
      externalCustomerId: user.id, // the person paying, kept on a new Polar customer
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
const subscriptions = await polar.listSubscriptions(ctx, { referenceId: user.id });
const paying = subscriptions.some((s) => s.status === "active" || s.status === "trialing");
```

Change, cancel or end it, from an action. The mirror updates right away,
before the webhook confirms it:

```ts
await polar.changeProduct(ctx, { subscriptionId, productId: yearly, prorationBehavior: "prorate" });
await polar.setCancelAtPeriodEnd(ctx, { subscriptionId, cancelAtPeriodEnd: true });
await polar.revokeSubscription(ctx, { subscriptionId }); // ends it now, e.g. on account deletion
// Polar's portal for the customer who pays it:
const portalUrl = await polar.createCustomerPortalUrl({ customerId: subscription.customerId, returnUrl });
```

Read the products and their prices, reactively:

```ts
const products = await polar.listProducts(ctx); // archived ones with { includeArchived: true }
const monthly = await polar.getProduct(ctx, { id: monthlyProductId });
```

Anything else in Polar's API, with the token and pinned version (Polar's
snake_case shapes, see the [API reference](https://polar.sh/docs/api-reference)):

```ts
await polar.request("PATCH", `/v1/products/${id}`, { body: { prices: [price] } });
```

### Reacting to events

Pass a mutation to run for every event, once, in the same transaction as the
mirror update. It gets the event type, the raw JSON, and the subscription or
product as now mirrored (null for other events):

```ts
// convex/billing.ts
import { vWebhookEvent } from "@skuljanze/convex-polar";

export const onPolarEvent = internalMutation({
  args: vWebhookEvent,
  handler: async (ctx, { type, payload, subscription, product }) => {
    if (type === "subscription.created") { /* send a welcome email */ }
  },
});

// convex/http.ts
polar.registerRoutes(http, { onEvent: internal.billing.onPolarEvent });
```

If it throws, the delivery fails and Polar retries it.

## The mirrors

`listSubscriptions` and `getSubscription` return:

| Field | |
| --- | --- |
| `id`, `customerId`, `productId` | Polar ids |
| `referenceId` | what it's for: the checkout's `referenceId`, else the customer's external id, else null |
| `externalCustomerId` | the paying customer's external id, or null |
| `status` | `incomplete`, `incomplete_expired`, `trialing`, `active`, `past_due`, `canceled`, `unpaid`, `paused` |
| `amount`, `currency`, `recurringInterval`, `recurringIntervalCount` | the price |
| `currentPeriodStart`, `currentPeriodEnd` | the period paid for |
| `trialStart`, `trialEnd`, `startedAt`, `canceledAt`, `endsAt`, `endedAt` | or null |
| `cancelAtPeriodEnd` | set to end with the current period |
| `metadata` | from the checkout |
| `createdAt`, `modifiedAt` | when Polar made and last changed it |

`listProducts` and `getProduct` return `id`, `name`, `description`,
`isRecurring`, `isArchived`, `recurringInterval`, `recurringIntervalCount`,
`trialInterval`, `trialIntervalCount`, `metadata`, `createdAt`, `modifiedAt`
and `prices`, each with `id`, `amountType` (`fixed`, `custom`, `seat_based`,
…), `priceCurrency`, `priceAmount` (cents, fixed prices only) and
`isArchived`.

Times are milliseconds since the epoch.

## Migrating from `@convex-dev/polar`

1. Replace the component in `convex.config.ts` and the client, and pass a
   `referenceId` to every checkout (what `getUserInfo` returned as `userId`).
2. Switch the webhook endpoint to format **Raw** and API version **2026-10**.
   `@polar-sh/sdk` and any `whsec_` patch can go.
3. Run `syncProducts` and `syncSubscriptions` once per deployment.
4. Subscriptions bought before the switch have no `referenceId` in their
   metadata, so they're found by the customer's external id, which the old
   component never set. Set it in Polar (`PATCH /v1/customers/{id}` with
   `external_id`, through `polar.request`), or add `referenceId` to the
   subscription's metadata, then sync again.

## Testing

Register the component in `convex-test`:

```ts
import polarTest from "@skuljanze/convex-polar/test";

const t = convexTest(schema, modules);
polarTest.register(t);
```

`signWebhook(body, secret)` signs a delivery the way Polar does, to test your
handlers through `t.fetch("/polar/events", …)`.

## Polar API versions

Polar releases a new API version each quarter and removes the oldest, so each
version lives about nine months ([versioning](https://polar.sh/docs/api-reference/versioning)).
This package reads `2026-10` (`POLAR_API_VERSION`). When it moves to a newer
version, update the package and your webhook endpoint's version together.

## License

MIT
