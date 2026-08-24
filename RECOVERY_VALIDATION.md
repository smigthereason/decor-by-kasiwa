# Recovery Validation

This recovery incorporates the accepted UI revisions from the supplied DeepSeek conversation export while retaining the later client-approved Decor by Kasiwa colour palette and the three-surface App Router architecture.

## Structure

- `app/(shop)` — customer-facing website
- `app/admin` — admin office
- `app/store` — store / fulfilment operations
- `app/api` — shared API routes

## Checks completed

- TypeScript/TSX syntax transpile check: **75 files, 0 syntax-error files**.
- Next.js page-route collision check: **35 page routes, 0 duplicate routes**.
- Local `@/...` import resolution check: **0 missing local imports**.
- Generated build/dependency directories removed from the recovery package.
- `useSearchParams()` call sites retain their required Suspense boundaries in the relevant route/component trees.
- Sanity remains optional: the project does not require a configured Sanity project merely to evaluate the non-Studio application routes.

## Full build limitation

A clean `npm ci` was attempted in the recovery environment but dependency retrieval could not complete within the available network window. As a result, this package does **not** claim that a full `next build` was executed successfully here.

On a normal development machine, validate with:

```bash
npm ci
rm -rf .next
npm run build
```

If dependencies are already installed locally, `npm run build` is sufficient after replacing the recovered source files.
