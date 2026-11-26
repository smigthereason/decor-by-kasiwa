# DBK155 — Kasiwa sales experience and knowledge

## Scope and release constraints
Based on the 25 Nov 2026 source archive, not a fresh checkout of DBK153/main. Do not overwrite uncommitted Meta migration code. This patch adds relevant product filtering, exact shortlist selection, real Sanity image URLs, conversational command aliases, improved checkout messages, live ecommerce price plus pinned-store stock verification, a callback readiness check, and an admin-only Neon knowledge editor with draft preview and published history. It does not enable public access, auto-stock, delivery charges or autonomous variant checkout. Variants and delivery are staff-assisted. Natural language is intentionally bounded; explicit consent is still required for payment. Published knowledge is used for informational questions; transactional messages stay deterministic. No real provider calls or production mutations were performed while preparing this patch.

## 1. Apply in local repository

```bash
cd ~/Work/decor-by-kasiwa
git status --short
git apply --check ~/Downloads/DBK155-kasiwa-sales.patch
git apply ~/Downloads/DBK155-kasiwa-sales.patch
python3 scripts/dbk155-install-worker-media.py
python3 scripts/dbk155-install-worker-media.py --apply
node --check infra/dbk36/production-worker/dbk36-prod-worker.mjs
node --experimental-strip-types --test scripts/dbk155-sales.test.mjs
npx tsc --noEmit
git diff --check
```
If a check fails, stop; do not use `--reject`, force apply, or overwrite the existing Worker. The media installer targets the current signed Meta payload only and refuses unknown shapes. The archived Worker predates the restricted Meta migration, so the actual current local Worker is required to validate it.

## 2. Apply additive Neon migration
Open the Neon project already configured for the live Decor By Kasiwa database. In its SQL Editor run the complete contents of `scripts/dbk155-knowledge.sql`. It creates two tables only. Do not run against staging or another database by mistake. Confirm both tables exist. The admin API assumes the application's existing DATABASE_URL, no new secrets.

## 3. Cloudflare release first
Ensure the Worker config still has Meta YES, YCloud NO, public NO, correct phone and WABA. Confirm the new media code passes syntax and existing Worker tests that apply to the current Meta branch. Rotate any previously exposed token and upload the replacement with the code. Do not deploy an obsolete archive Worker. Upload current local Worker via `npx wrangler versions upload --config infra/dbk36/production-worker/wrangler.dbk36-production.jsonc --tag DBK155-META-MEDIA` (include replacement secret safely if needed). Deploy the exact returned version ID at 100% with `npx wrangler versions deploy VERSION_ID@100% --config infra/dbk36/production-worker/wrangler.dbk36-production.jsonc --yes`. Keep payment callback and reconciliation OFF until their configuration is reviewed. No changes to existing signed perimeter. For rollback use the last verified working Worker version.

## 4. Deploy backend only after media Worker is active
Stage only these files, not `git add .`:

```bash
git add -- components/backoffice/BackOfficeShell.tsx lib/db/dbk36-production-payments.ts lib/whatsapp/dbk36-production-chat.ts lib/whatsapp/dbk36-production-messages.ts lib/whatsapp/dbk155-sales-core.ts lib/whatsapp/dbk155-knowledge.ts app/admin/whatsapp/knowledge/page.tsx app/api/backoffice/whatsapp/knowledge/route.ts scripts/dbk155-knowledge.sql scripts/dbk155-sales.test.mjs scripts/dbk155-install-worker-media.py docs/DBK155-KASIWA-RELEASE.md
git diff --cached --check
```
Review staged diff, commit the listed files only and deploy to the existing Vercel project using the established process. Do not commit other local changes or secrets. Keep `DBK100_WA_AI_ENABLED=YES`, the working production phone ID and `OPENAI_API_KEY`. Existing catalogue refresh must run successfully (the old cache has no images until refreshed). Check the next successful scheduled refresh, or use the existing authenticated refresh mechanism. Do not add a public refresh endpoint.

## 5. Restricted sales test
On the allowlisted personal number:
- Ask for decorative mirrors: only matching items, catalogue prices and images. Ask about an unavailable category: no fabricated items.
- Select a product by number/name, review cart, request checkout, confirm collection. Do not authorize payment yet. Confirm variants and delivery are routed for staff confirmation rather than invented.
- Open `/admin/whatsapp/knowledge`, edit business facts, test draft, publish, then ask a matching informational question. Check access as non-admin is denied. This is runtime knowledge, not model fine-tuning.

## 6. Controlled payment readiness and pilot
The archived code requires `DBK36_WA_PRODUCTION_CHECKOUT_ENABLED=YES`, `DBK36_WA_STORE_LOCATION_ID` pinned to the actual configured pickup store, `MPESA_ENV=production`, `DBK36_WA_PRODUCTION_MPESA_CALLBACK_URL=https://dbk36-whatsapp-production.victor-dmaina.workers.dev/api/whatsapp/stk/callback`, existing Daraja credentials and the paid-intake/bridge flags. Verify rather than change the existing pinned location arbitrarily. The Worker must accept callbacks (`DBK36_PRODUCTION_MPESA_CALLBACK_ENABLED=YES`) and run reconciliation (`DBK36_PRODUCTION_RECONCILE_ENABLED=YES`); review its current cron configuration and signed endpoints before uploading a separate version with those gates enabled. Do not enable public bot or automatic stock writes. Check Worker health reports callbackEnabled true. Verify callback persistence and the existing finalization SQL in the live DB.

With the owner's approval, clear the test cart, choose a genuinely available whole-KES product at or below KES 500, confirm its actual total and pickup. Explicitly send `send M-PESA prompt`. Approve the official prompt only on the test phone. Check Daraja callback, independent query, paid record and one intake/fulfilment record. A second request must not create a duplicate charge. If uncertain, stop and reconcile; never retry automatically. Confirm actual settlement and no duplicate stock deduction. The current limit is 500; existing source allows 5000 only with `DBK100_WA_EXTENDED_STK_APPROVED=YES`. Set that only after documented successful rehearsal and owner approval, redeploy Vercel, and test the intended 4500 order with consent. Do not alter the limit in code or bypass quote validation. The separate quote-validation endpoint has its own KES 500 validation; verify any downstream consumers before extended rollout. If no product fits the pilot, obtain owner-approved test SKU rather than falsifying a price.

## Remaining limitations
Actual media delivery, DB migrations, Vercel full typecheck/build, Daraja integration and settlement, live permissions, and release all require verification in the user's environment. The knowledge editor is admin-only; no automatic staff assignment, broad free-form transactional AI, automatic variant checkout, delivery quotation or fully automated customer payment notification has been added. The existing paid order status check uses verified records. Keep the allowlist and payment controls in place until these acceptance tests pass.
