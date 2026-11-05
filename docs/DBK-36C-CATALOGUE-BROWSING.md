# DBK-36C — Catalogue categories and pagination (isolated test environment)

**Architecture:** Sanity remains read-only product-content authority. An authenticated manual refresh fetches ecommerce products from Sanity and stores a minimal eligible-product snapshot in a **new Neon test-branch catalogue cache table**. Every WhatsApp browse/search/page/detail request reads that Neon snapshot. Per-conversation browsing state is stored in a separate **Neon test-branch table**. No order/payment/inventory/Sanity mutation is introduced.

## Installation / safety

1. Only use the existing `feat/dbk36-whatsapp-agent` checkout. Protect untracked and uncommitted work; never run `git clean` or reset.
2. Apply the patch, run `node --experimental-strip-types --test scripts/dbk36_whatsapp.test.mjs scripts/dbk36_browse.test.mjs` and `npx tsc --noEmit` **before enabling replies**.
3. In **Neon SQL Editor**, explicitly select `dbk36-whatsapp-test` (not Production) and execute `migration/dbk36/whatsapp-catalogue-browser.sql`. Confirm both `to_regclass('public.dbk36_wa_catalogue_cache')` and `to_regclass('public.dbk36_wa_browse_states')` exist.
4. Keep the **local** bot using `scripts/dbk36_start_local.sh`, which verifies test Neon, restricts recipients and disables configured payment and Sanity write tokens. No Vercel production deployment. Keep the tunnel on port 8787 (not 3100).
5. With the local Next.js server running, execute:
   `env -u DATABASE_URL -u WHATSAPP_WORKER_SECRET node --env-file="$HOME/.config/dbk36/whatsapp-test.env" scripts/dbk36_catalogue_sync.mjs`
   This makes an **authenticated POST to localhost only**, which reads Sanity catalogue and writes only the test Neon cache. It does **not** send WhatsApp messages.
6. Send `MENU` then `1` to browse categories; number selects a category (1–4); number selects a product (1–4); `NEXT` for subsequent pages; `BACK` for categories; `MENU` resets; `5` requests staff. Send `search mirrors` to search any time. Number `2` is a product/category selection while a browsing page is active; send `MENU` first if you want the root delivery option.

## Behaviour

- Four categories/products per page, dynamic from real catalogue data, and deterministic name/category/description matching.
- Out-of-stock, unavailable, disabled, unpriced products are excluded **when cache is created**; checkout independently verifies inventory and prices. A snapshot is **not a stock reservation**.
- Cache defaults to 60-minute maximum age (`DBK36_CATALOGUE_MAX_AGE_MINUTES`). When absent/stale, the bot refuses to quote cached prices and links customers to the website. For a production pilot, use an approved scheduled refresh (e.g. every 15 minutes) and audit stale data handling **before** enabling the bot.
- No automatic Sanity re-fetch on an incoming message; refreshing happens **only** through the secret-authenticated local route. Local tunnel gateway forwards only signed WhatsApp webhook GET/POST.
- Existing Meta allowlist remains enforced by `sendWhatsAppText`. Human takeover remains active and suppresses further automatic replies.
- Browse state expires after 30 minutes. WhatsApp messages remain in the existing Neon inbox tables.

## Known limitations / rollout gates

- This patch is designed against the **Nov 4 DBK-36B working code** shown in the conversation, not a live clone of your private local repository. Run `git apply --check`, both test suites and TypeScript/build checks locally.
- If catalog sync fails, inspect the server log without exposing credentials; the old cache is not replaced.
- Product-category names and delivery rates should be validated by the business; no new prices or categories were hardcoded.
- This is **not** a production cutover. Checkout, cart, order/payment creation, image cards and CRM are out of scope.
- The project uses a Meta test number and an expiring Meta test access token; monitor token validity.
