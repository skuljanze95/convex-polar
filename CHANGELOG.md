# Changelog

## 0.2.0

- Subscriptions are looked up by `referenceId` (what they're for), which
  `createCheckout` keeps in the subscription's metadata, instead of the
  customer's external id: Polar keeps one customer per email, so one person
  can pay for several references. `listSubscriptions({ referenceId })`
  replaces `listSubscriptions({ externalCustomerId })`, and `createCheckout`
  requires `referenceId`.
- `createCustomerPortalUrl` takes the Polar `customerId` too.
- A product mirror, fed by `product.*` webhooks: `listProducts`, `getProduct`,
  `syncProducts`. `onEvent` gets the mirrored `product`.
- `syncSubscriptions` fills the mirror from Polar's API.
- `revokeSubscription` ends a subscription now.
- `createCheckout` takes `embedOrigin`.

## 0.1.0

- First release: checkout, customer portal, product changes and
  cancel-at-period-end, a webhook-fed subscription mirror with deduplicated
  deliveries and an `onEvent` hook, and `request()` for the rest of Polar's
  API. Reads Polar API version 2026-10.
