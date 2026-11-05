# DBK-36 — WhatsApp Sales Assistant (No OpenAI Required)

**Revised November 2, 2026** — DBK-36B-RULES. This implementation extends the Day 1 foundation and replaces all OpenAI inference with deterministic, menu-driven replies. It is **not deployed or tested with a real Meta number**. The bot defaults to OFF.

## What the current assistant does

- Sends a welcome menu and accepts `MENU`, `1` browse, `2` delivery/pickup, `3` track order, `4` custom order, or `5` speak with staff.
- Accepts customer product search phrases (for example, `wall mirror` or `cushions`) and queries the **live ecommerce catalogue**. Never lists out-of-stock, disabled, unavailable, or unpriced items. Quotes current catalogue prices with links to the existing website, not unsourced prices.
- Retrieves active delivery zones from the **existing checkout configuration**, with `quote required` where configured. Prices and stock are still revalidated at website checkout.
- Directs customers to the existing `/track-order` page. Does **not** read private order status, demand account credentials, or assert payment success.
- Directs customers to website product pages for cart and payment; it does not create orders, initiate payments, reserve inventory or claim fulfilment in chat.
- Automatically marks `4`, `5`, custom work, complaints/refunds, and photo enquiries for human takeover in the existing `/admin/whatsapp` inbox. Photo media is recorded as a Meta media ID only; no image preview/download is implemented.
- Supports a small set of English (and limited Kiswahili) keywords. It is **not a natural-language AI agent** and cannot interpret arbitrary requests reliably.

**No OpenAI account, API key, API spending or OpenAI model is needed.** There are no calls to `api.openai.com`. Meta WhatsApp messaging charges may still apply, and Meta API credentials and a working HTTPS webhook are required.

## Files added or changed in this update (relative to DBK-36A Day 1)

- `lib/whatsapp/rules.ts` — pure routing, text templates, live-data formatting, catalogue ranking and staff routing.
- `lib/whatsapp/agent.ts` — fetches live catalogue or delivery configuration only when needed; never calls an AI provider.
- `lib/whatsapp/processor.ts` — uses staff escalation rules and the deterministic assistant; no conversation history sent to external AI.
- `app/admin/whatsapp/page.tsx` — renamed AI labels to automated/rules bot.
- `.env.example` — removed unused `OPENAI_API_KEY` and `OPENAI_MODEL` entries.
- `scripts/dbk36_whatsapp.test.mjs` — adds rules, pricing, menu, delivery and handover tests.

## Required server-only environment values

```dotenv
WHATSAPP_BOT_ENABLED=NO
WHATSAPP_VERIFY_TOKEN=<your random verification secret>
WHATSAPP_APP_SECRET=<Meta App Secret>
WHATSAPP_PHONE_NUMBER_ID=<Meta Phone Number ID>
WHATSAPP_ACCESS_TOKEN=<Meta WhatsApp Cloud API token>
WHATSAPP_GRAPH_VERSION=<supported Graph API version>
WHATSAPP_WORKER_SECRET=<separate random secret>
DATABASE_URL=<approved Neon database URL, server-side only>
NEXT_PUBLIC_SITE_URL=https://www.decorbykasiwa.co.ke
```

The existing site database credentials and checkout configuration must continue to work. You may remove `OPENAI_API_KEY` and `OPENAI_MODEL` from `.env.local` and Vercel environment settings; they are not used by this implementation. Do not share any secrets or commit them to Git. The two Neon tables from Day 1 are still required (see `migration/dbk36/whatsapp-foundation.sql`).

## Deploy and test safely

1. Preserve ongoing DBK-76–92 local changes. Apply the **incremental DBK-36B-RULES patch** while on your existing `feat/dbk36-whatsapp-agent` branch, and run `git apply --check` before `git apply`.
2. Run `node --experimental-strip-types --test scripts/dbk36_whatsapp.test.mjs`, then `npm run build`. Do not run `npm audit fix --force` as part of this patch.
3. Apply `migration/dbk36/whatsapp-foundation.sql` to an **approved test Neon database**, not production by default.
4. Configure the Meta test number, supported Graph API version, token, signed webhook, and `messages` subscription on an HTTPS preview URL. Test the GET challenge and signed POST persistence while `WHATSAPP_BOT_ENABLED=NO`.
5. Enable bot replies only on the isolated test deployment and test the actual WhatsApp messages: `MENU`, `1`, `mirrors`, `2`, `3`, `4`, `5`, staff takeover, photo, retries, duplicate webhook, invalid signature and 24h messaging window.
6. The webhook calls a worker after ACK; configure a secret-authenticated scheduled recovery call to `/api/whatsapp/process` for retries. Do not expose `WHATSAPP_WORKER_SECRET` in frontend code.
7. Confirm business approval for customer privacy, staff responsibility and message-retention policy. Verify operation during DBK-74 maintenance: the existing proxy may block webhook POSTs during a freeze.
8. Do not turn on live production until the pilot signs off and external Meta/API behaviour is confirmed.

## Future feature: optional AI conversations (not included)

Later, after separate approval and client-controlled API billing, add an **opt-in** AI provider behind an explicit feature flag (for example `WHATSAPP_AI_ENABLED=YES`), with the existing rule engine retained as the default and fallback. The future implementation must ground AI answers in live catalogue/delivery data, enforce allowed payment/stock claims, limit personal data, provide a human handover and monitor cost. Setting such a flag today has no effect — **there is intentionally no AI integration** in this build.

## Remaining three-day MVP scope

- Day 2: build **safe in-WhatsApp cart/checkout** (currently website-link checkout only). Use existing server-authoritative Paystack and DBK-64 paths; require explicit customer approval and enforce idempotency, current pricing, stock and valid payment references.
- Day 3: full message and website-order verification, staff operations and incident monitoring, end-to-end Meta tests, delivery confirmation and a controlled pilot.
- Deferred: AI natural-language chat, catalogue image cards, media download/preview, CRM, marketing broadcasts, custom-item pricing automation and advanced analytics.
