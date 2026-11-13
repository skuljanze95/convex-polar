# Contributing

```sh
pnpm install
pnpm test        # vitest, with type checks
pnpm typecheck
pnpm build
```

## Changing the component

The component's `_generated/` files are committed. After changing anything
in `src/component/`, regenerate them. Codegen evaluates the component on a
Convex deployment (it doesn't change it), so point it at any dev deployment
you have:

```sh
CONVEX_DEPLOYMENT=dev:your-deployment pnpm build:codegen
```

## Moving to a new Polar API version

1. Diff the OpenAPI specs of the two versions
   (`https://github.com/polarsource/polar/tree/main/docs/openapi`) for the
   schemas used here: `Subscription`, `CheckoutProductsCreate`,
   `CustomerSessionCustomerExternalIDCreate`, `SubscriptionUpdate`.
2. Update `POLAR_API_VERSION` (`src/client/api.ts`), the validators
   (`src/component/validators.ts`), the parser (`src/client/parse.ts`) and the
   fixtures, then run the tests.
3. Release a minor version, and note in the changelog that the webhook
   endpoint's API version must change with it.

## Releasing

```sh
npm login
npm version patch   # or minor
npm publish --access public
git push --follow-tags
```
