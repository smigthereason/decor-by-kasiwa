# DBK-51 — Neon transactional inventory foundation

**Status: TEST BRANCH ONLY; NOT PRODUCTION INVENTORY CUTOVER.**

## Scope delivered

- PostgreSQL stock ledger and balances for product, variant and location (including `__UNALLOCATED__`).
- PostgreSQL transactions for PURCHASE, RECEIVE, TRANSFER, SALE and RETURN for **one product/variant per call**.
- Product-scoped transaction advisory lock; no negative available/incoming stock.
- Operation ID idempotency, conflicting replay rejection, and audit of each successful operation.
- Read-only Sanity export snapshot planner. Fails closed on duplicate stores/products, unknown variant allocations, invalid quantities, and aggregate mismatches.
- One-shot, guarded **test-branch** seed and concurrency smoke test; test fixtures cleaned after testing.
- TypeScript wrapper is deliberately **not wired to existing routes**. Sanity retains authoritative stock, POS, payments, inventory corrections and reports.

## Why not turn on live stock writes yet?

`app/api/backoffice/inventory/movements/route.ts` patches `product` + `inventoryRecord` and creates an `inventoryMovement` inside one Sanity transaction. `lib/pos/server.ts` performs stock mutation inside Sanity order/payment reconciliation transactions. Payment confirmation must remain final even if stock reconciliation needs review. Switching only the inventory API, or only the POS deduction, would let Sanity and Neon disagree; PostgreSQL cannot atomically commit the Sanity document changes without an explicit coordinated architecture. The current SQL function is a **per-product transaction**, not a complete multi-line checkout transaction.

## Install and local unit tests

```bash
cd ~/Work/decor-by-kasiwa
# From the extracted DBK-51 package:
git apply --check ~/Downloads/DBK-51-neon-stock-engine/DBK-51-neon-stock-engine.patch
git apply ~/Downloads/DBK-51-neon-stock-engine/DBK-51-neon-stock-engine.patch
node --test scripts/dbk51_stock_core.test.mjs scripts/dbk51_stock_sql_safety.test.mjs
npx tsc --noEmit
npm run build
```

## 1. Read-only plan from fresh Sanity export

Use a new `sanity dataset export` after store staff finish changing stock, or freeze writes for a final cutover snapshot. The planner does **not connect to Neon or write to Sanity**.

```bash
node scripts/dbk51_stock_snapshot.mjs \
  "$HOME/Downloads/DBK-sanity-private-backups/DBK50-inventory-20261028-093609.tar.gz"
```

Read `safeToSeed`, `problemCount`, `quantityTotals`, and the 64-character `fingerprint`. If `safeToSeed=false`, do **not** seed. Investigate the reported Sanity inconsistencies first. Use a fresh export for up-to-date results; the example file is stale if stock has changed.

## 2. Neon branch for integration testing

Create `dbk51-test` **from Neon production**. Ensure it is a separate branch with a distinct pooled connection hostname. Run `migration/dbk51/neon-stock-engine.sql` in the SQL Editor on that **test branch**, NOT on production. It creates DBK-51 tables and functions, with writes disabled by default.

Create an ignored `.env.dbk51-test.local` containing only a **test-branch** `DATABASE_URL` and the required nonsecret app settings. Use your existing ignored test environment as a template, but replace its `DATABASE_URL` with the new branch's URL; do not post the URL.

```bash
chmod 600 .env.dbk51-test.local
echo '.env.dbk51-test.local' >> .git/info/exclude
```

Host checks are mandatory in both test-write scripts. Obtain the hostname by reading the URL **locally**, not by sharing credentials:

```bash
node --env-file=.env.dbk51-test.local -e \
  'console.log(new URL(process.env.DATABASE_URL).hostname)'
```

## 3. One-time test snapshot seed

Replace the two host placeholders, export path and PLAN_FINGERPRINT. The production host is known from Neon Production -> Connect. **Never use `.env.local` or your production Neon URL for a seed test.**

```bash
DBK51_EXPECTED_TEST_HOST='<NEW-TEST-HOST>' \
DBK51_PRODUCTION_HOST='<VERIFIED-PRODUCTION-HOST>' \
DBK51_TEST_WRITE=YES \
node --env-file=.env.dbk51-test.local \
  scripts/dbk51_stock_snapshot.mjs \
  '<PRIVATE-SANITY-EXPORT-PATH>' \
  --seed-test --confirm-fingerprint='<PLAN_FINGERPRINT>'
```

This initializes *test tables only*. It cannot reinitialize a table with existing balances/operations. If you need a different snapshot, create a new test branch; do not truncate or delete the existing inventory tables in production.

## 4. Test the transaction engine on the same test branch

```bash
DBK51_EXPECTED_TEST_HOST='<NEW-TEST-HOST>' \
DBK51_PRODUCTION_HOST='<VERIFIED-PRODUCTION-HOST>' \
DBK51_TEST_WRITE=YES \
node --env-file=.env.dbk51-test.local scripts/dbk51_engine_smoke.mjs
```

The test creates a clearly isolated fixture, checks that the default write gate blocks stock operations, temporarily opens the gate on the test branch, exercises purchase/receive/transfer/sale/return, replay idempotency, conflicting replay, insufficient stock and **12 parallel sale attempts against 10 available units**, then closes the gate and deletes its test fixtures. A failure requires investigation; the cleanup runs in `finally`.

**The database integration test has NOT been executed by the patch author against your Neon project.** Run it on the test branch and inspect its results.

## Production cutover still required — do not flip flags

1. Add a live, continuously refreshed Neon inventory projection sourced from current Sanity product and inventory revisions; reconcile all store and variant totals after a write freeze or robust change-data-capture backfill.
2. Migrate **every** inventory-changing writer, not only inventory movements: receipt, transfer, corrections/voids, initial stock and variant edits, POS, online orders, returns/refunds and payment callbacks. Multi-line POS sales must be treated atomically across all affected products.
3. Reconcile order, payment, and movement history with idempotency and replay-safe settlement. Handle successful payments with inventory exceptions without losing financial truth.
4. Move inventory dashboards, catalogue availability, exports, reports and corrections to Neon. Verify authorization and store isolation.
5. Integration-test M-Pesa/Paystack callback retries, out-of-stock, simultaneous checkout and partial failures; deploy behind reviewed flags with rollback and monitoring.
6. Only then enable `DBK_INVENTORY_BACKEND=neon` *and* the PostgreSQL engine gate with a coordinated cutover. Neither flag should be set in production now. Do not delete live Sanity inventory/order/payment documents.

Existing `dbk_inventory_movement_archive` remains a historical JSONB archive. DBK-51 balances are a **new authoritative-stock candidate**, NOT a replay of archived movement quantities (which would double-count initial stock).

## DBK-51R — Unidentified variant stock quarantine (test-seed only)

Sanity's `inventoryRecord.unallocatedOnHand` explicitly records quantity whose colour/size is **unknown**. It is not part of `product.variants[].stockQuantity` and is not allocated to a store. Prior DBK-51 planner blocked even an isolated test seed on these records. The revised planner **preserves** this quantity separately, without assigning it to an invented variant:

- It creates one row per affected product with `variant_id='__UNALLOCATED_VARIANT__'` and `location_id='__UNALLOCATED__'`.
- The existing SQL `dbk51_apply_stock` rejects this reserved variant for **every** operation type. Therefore the stock cannot be sold, received, transferred, or returned through the DBK-51 engine.
- `quantityTotals.onHand` now includes both known variant quantities **and** quarantined unknown-variant units; **do not label that number "sellable".** `quantityClassification.storeSellableOnHand` excludes both unidentified variants and known variants in `__UNALLOCATED__` location.
- The planner lists `quarantinedProducts` (names, IDs, quantity, source revision) for a later supervised physical reconciliation.
- No Sanity document or Neon production balance is changed. `safeToSeed=true` only authorizes the isolated **test-branch** snapshot seed when all other consistency checks pass. It does **not** authorize POS, financial flows or production cutover.

Never simply set these units to a popular variant, or add them to the Main store, without verified physical counts and an auditable transfer/reconciliation approval. For a new snapshot, export Sanity again after stock changes have stopped, rerun the planner, and recheck the fingerprint. Keep `DBK_INVENTORY_BACKEND` unset or set to Sanity in production.
