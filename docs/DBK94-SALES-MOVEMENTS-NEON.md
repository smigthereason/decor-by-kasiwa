# DBK-94 — Sales movement DOCUMENTS in Neon, without switching stock authority

This patch is based on the uploaded Nov 2 source snapshot. Apply it on a
separate branch and perform `git apply --check` against the CURRENT branch.

## Precise scope

Only new `SALE` `inventoryMovement` documents created by the legacy POS and
Paystack transaction paths can move to Neon. The actual stock deductions, POS
order/payment records, refunds, purchases, receiving and transfers continue
using their existing Sanity-authoritative transaction logic. This prevents
mixing stock authorities while the 940 legacy receivables remain unresolved.

*OFF by default*. When on, the existing Sanity transaction stores immutable
sale movement evidence *inside the existing commerceOrder document* rather
than create a standalone `inventoryMovement`. This is a durable transaction
journal, **not a new Sanity document**. Post-commit projection writes the
record into Neon `dbk94_sale_movements`, keyed by deterministic movement ID.
Retries cannot duplicate records. The SQL does not alter inventory balances.
On a Neon network failure, the order is still committed; the operator replay
script can recover and verify exact parity of every embedded movement record.

## Install (do not activate yet)

1. Back up current Neon and Sanity production states. Use a maintenance or
   reviewed deployment process and ensure checkout/provider callbacks are sane.
2. Review `migration/dbk94/sales-movements.sql` in **production Neon SQL Editor**,
   check project and branch, and apply create-only schema. This does not switch
   any payment or stock gates.
3. Run `node --test scripts/dbk94_contract.test.mjs`, `npx tsc --noEmit`,
   `npm run build`, test the POS Manual, POS M-Pesa/Paystack and Online Paystack
   paid/unpaid/idempotent states on a nonproduction Sanity dataset and Neon
   branch. Staging-only mode additionally requires `DBK94_STAGING_TEST=YES`,
   `DBK94_SALE_MOVEMENT_STORE=neon`, `DBK94_SALE_MOVEMENT_APPROVED=YES`,
   `VERCEL_ENV=preview` (or `NODE_ENV=development`) and the pinned DBK-62
   test Neon host. It explicitly refuses the production Sanity dataset.
   Apply the SQL schema to the test branch independently.
4. Deploy while DBK94 flags remain absent. Run a read-only Sanity count audit.
5. In a reviewed production change, enable ONLY:
   `DBK94_SALE_MOVEMENT_STORE=neon`
   `DBK94_SALE_MOVEMENT_APPROVED=YES`
   (Both require the pinned production Neon database.)
6. Verify an actual paid manual POS and online Paystack payment: stock deducted
   once, payment settled once, no new Sanity `SALE` movement docs, embedded
   order journal created, Neon projection exact, receipts/reconciliation OK.
   M-Pesa must be tested with the corresponding production callback path.
7. Independently run the read-only journal parity audit using the existing
   production env (do not use `vercel env run`):
   `node --env-file=.env --env-file=.env.local scripts/dbk94_replay_sale_movements.mjs --audit`
   To recover missing Neon projections (only after approval), set
   `DBK94_NEON_PROJECTOR_APPROVED=YES` and use `--project`, then re-run audit.

## Rollback

Set `DBK94_SALE_MOVEMENT_STORE=sanity` to restore **new** Sanity movement
creation, after verifying deployed flags. Never delete the embedded journals
or the Neon table. New stock authority remains Sanity throughout this patch.
Existing movement documents are unaffected. Do not attempt to convert past
SALE movements retroactively without separate archive verification.

## Warnings

- **No automatic production flip or deletion** is performed by this patch.
- Production flags should be changed only after schema installation and
  staging validation. New writes can still fail due to Sanity's persistent
  document quota for orders/payments/audits/customers.
- Sanity remains a database of record for orders and stock. This step only
  eliminates newly created SALE movement *documents*, not all inventory
  movement documents (purchases, receipts, transfers), nor orders or payments.
- There is no scheduler in this patch: the operational replay script must be
  executed during incident recovery if real-time projection fails. Confirm
  expectedMovements = neonMatchingMovements after activation.
