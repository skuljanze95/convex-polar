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

Releases publish from GitHub Actions (`.github/workflows/release.yml`) with
npm trusted publishing, so no npm token is stored anywhere. Add the version's
notes to `CHANGELOG.md` (a `## x.y.z` heading), then:

```sh
npm version patch   # or minor; commits and tags vX.Y.Z
git push --follow-tags
```

The tag runs the workflow: it checks the tag matches `package.json`, builds,
tests, publishes with provenance, and creates the GitHub release.

Trusted publishing is set on npmjs.com under the package's Settings →
Trusted publishing: GitHub Actions, repository `skuljanze95/convex-polar`,
workflow `release.yml`.
