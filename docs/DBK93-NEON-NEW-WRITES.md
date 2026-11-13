# DBK-93: Neon authority for NEW operational records

## Scope
Existing code already routes new documents to Neon when its separate, fail-closed
production switches are approved: DBK-62 POS, DBK-64 online orders and Paystack,
DBK-68 M-Pesa, DBK-69 stock, independent audit writes, staff activity.
Sanity remains the authoritative product/website catalogue.

## Run locally — READ ONLY
```bash
cd ~/Work/decor-by-kasiwa
node --test scripts/dbk93_new_writes_core.test.mjs
node --env-file=.env --env-file=.env.local scripts/dbk93_neon_new_writes_preflight.mjs
```
Exit 2 indicates blockers. This tool NEVER enables Neon writes, alters Vercel,
opens PostgreSQL write gates, or deletes Sanity documents. Local flags may differ
from Vercel's deployed Production environment. Do not use `vercel env run` as a
lookup command: a previous attempted invocation created an unintended project.

## Why not blindly change DBK_INVENTORY_BACKEND right now?
The actual POS/online/stock writers are protected by database SQL gates,
production-host checks, stock reconciliation, frozen Sanity authority, callback
settlement, reporting and legacy receivable/refund constraints. In particular,
DBK-76 explicitly fails when legacy receivables still cannot be handled via Neon.
Changing only the env variable can block real payments and stock operations.

## Approved production cutover checklist
1. Fresh, recoverable backups and current Sanity ↔ Neon inventory parity.
2. A controlled stock-writer freeze and read-only DBK-76 readiness report.
3. No pending provider callbacks or paid-uncommitted stock exceptions.
4. Legacy receivables/refunds, POS history, M-Pesa, online settlement and reports proven.
5. Ten Neon database write gates and DBK-62 approval record inspected under
   operator control. Do not bypass SQL safety guards.
6. Independently confirm Vercel **Production** flags on existing Decor By Kasiwa
   project, deployed revision and rollback route. Apply as one approved release.
7. Run real controlled receipt, callback, refund, inventory Edit/Void and reporting
   tests before reopening.
8. Measure new Sanity document growth and stop any remaining legacy writers.

This is a staged readiness patch, not an automatic commerce data migration.
Copying historical documents to Neon will not free Sanity capacity; the verified
Sanity originals must be retired separately by approved tools or quota increased.
