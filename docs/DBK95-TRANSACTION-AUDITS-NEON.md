# DBK-95 — New POS and online transactional audit events in Neon

## Scope
Move the **standalone Sanity auditEvent document** created by legacy POS order,
POS payment/initiation/confirmation/reconciliation, receivable settlement,
return/refund processing and Paystack online settlement into Neon `dbk_live_audit_events`, while retaining
an atomic journal nested in the existing `commerceOrder` transaction.

The first half of an event is the durable `dbk95AuditJournal` array on the
existing order, written in the same Sanity transaction as its stock/order/payment
changes. The second half projects it to Neon after the commit. This mirrors the
DBK-94 sale movement design, preserving the original deterministic POS audit IDs.
The historical audit readers already merge Neon live and archived events.

## Deliberate exclusions
- Sanity remains the authority for orders/payments/stock pending DBK-62/76.
- Old `auditEvent` documents remain untouched.
- No background worker is installed. Recovery is an explicit replay command.

## Rollout procedure
1. On a fresh branch from DBK-94's merged main, apply patch. Do not reapply DBK94.
2. Ensure `public.dbk_live_audit_events` exists in **production Neon** (DBK-48),
   and the prod admin audit views already render historical and Neon live events.
3. `node --test scripts/dbk95_contract.test.mjs && npx tsc --noEmit && npm run build`.
4. Deploy with **both DBK95 flags unset**, verify normal operations.
5. Validate `create(order)` followed by `patch(order)` within one Sanity
   transaction without writing any production data:
   `node --env-file=.env --env-file=.env.local scripts/dbk95_sanity_transaction_dryrun.mjs`
   The probe uses `dryRun=true` and verifies the throwaway ID was not persisted.
   If it fails, STOP. Also test the complete payment callback flow in isolation.
6. For approved production change, set **Production only**:
   `DBK95_TRANSACTION_AUDIT_STORE=neon`
   `DBK95_TRANSACTION_AUDIT_APPROVED=YES`
   Keep `DBK_AUDIT_ARCHIVE_READ=1`, `DBK_AUDIT_LIVE_READ=1`,
   `DBK_AUDIT_WRITE_BACKEND=neon`, `DBK_INVENTORY_BACKEND=sanity`.
7. Redeploy the existing Vercel project. Verify one real POS event and one
   Paystack online event including audit timeline and no new standalone Sanity
   `auditEvent` for either event. Verify no duplicate stock/payments.
8. From worktree, run read-only audit:
   `node --env-file=.env --env-file=.env.local scripts/dbk95_replay_transaction_audits.mjs --audit`
   If `unmatched>0`, investigate; to replay only immutable audit journal rows:
   `DBK95_AUDIT_PROJECTOR_APPROVED=YES node --env-file=.env --env-file=.env.local scripts/dbk95_replay_transaction_audits.mjs --project`
9. To stop new journal routing, set DBK95 flags absent/disabled and redeploy;
   do **not** delete the journal or Neon audit table.

## Safety
A Neon outage after the Sanity commit is not treated as a payment failure.
The journal is replayable, uses deterministic IDs and detects conflicting
payloads. The feature refuses a mismatched Sanity project, dataset or Neon host.
**This patch alone does not reduce the current Sanity document count**, only
selected new audit writes after explicit activation.
