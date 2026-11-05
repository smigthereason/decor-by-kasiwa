# DBK-36 — Restricted local webhook test (no Vercel)

This is an additive local-only helper. It does not modify the deployed website, POS, order data, existing `.env.local`, or any environment variables in Vercel. OpenAI is not required.

## 0. Prerequisites

- The DBK-36A/B/H patches have been applied and 13 tests and the production build pass.
- An isolated Neon test branch (`dbk36-whatsapp-test`) contains `dbk36_wa_conversations` and `dbk36_wa_messages`.
- Meta test WhatsApp number is active. **Regenerate the token shown in earlier screenshots before continuing.**
- `brew install cloudflared` on your Mac.

## 1. Private configuration (not in repo)

```sh
umask 077
mkdir -p ~/.config/dbk36
nano ~/.config/dbk36/whatsapp-test.env
chmod 600 ~/.config/dbk36/whatsapp-test.env
```

Enter shell variable assignments below (single quote around values). Never paste secrets into chat or screenshots.

```sh
DATABASE_URL='postgresql://THE-TEST-NEON-URL-INCLUDING-PASSWORD'
WHATSAPP_VERIFY_TOKEN='YOUR_RANDOM_SECRET'
WHATSAPP_APP_SECRET='META_APP_SECRET_FROM_APP_SETTINGS_BASIC'
WHATSAPP_PHONE_NUMBER_ID='META_TEST_PHONE_NUMBER_ID'
WHATSAPP_ACCESS_TOKEN='ROTATED_META_TEST_ACCESS_TOKEN'
WHATSAPP_GRAPH_VERSION='v25.0'
WHATSAPP_WORKER_SECRET='A_DIFFERENT_RANDOM_SECRET'
DBK36_ENABLE_REPLIES=NO
```

Generate verification and worker secrets with `openssl rand -hex 32` twice (different values). The webhook verify token must match Meta configuration exactly.

Do not replace the existing `.env.local` or the production `DATABASE_URL`. In this standalone process, the shell exports override Next.js `.env.local` keys.

## 2. Run three terminal processes

**Terminal A:** `bash scripts/dbk36_start_local.sh`

**Terminal B:** `python3 scripts/dbk36_webhook_gateway.py`

**Terminal C:** `cloudflared tunnel --url http://127.0.0.1:8787`

Copy the generated `https://...trycloudflare.com` URL. Public callers can reach **only** `GET/POST /api/whatsapp/webhook`. The gateway rejects POS/checkout/admin routes and does not expose `/api/whatsapp/process`.

Check gateway without exposing secrets:

```sh
curl -i http://127.0.0.1:8787/api/paystack/initialize
curl -i http://127.0.0.1:8787/api/whatsapp/webhook
```

Both must be denied (404) until the correct Meta verify query is supplied.

## 3. Configure Meta

In the WhatsApp app's configuration/webhooks, set callback URL to

`https://YOUR-TUNNEL.trycloudflare.com/api/whatsapp/webhook`

Set verify token to `WHATSAPP_VERIFY_TOKEN`. Subscribe to the WhatsApp Business Account's `messages` field. Keep bot replies off initially; a real inbound message will be recorded in test Neon.

For the **first** inbox persistence check, keep `DBK36_ENABLE_REPLIES=NO` and verify the test branch in Neon (use no actual customer data for testing).

```sql
SELECT wa_id, status, direction, created_at
FROM public.dbk36_wa_messages
ORDER BY created_at DESC LIMIT 5;
```

Only after verification, stop Terminal A, set `DBK36_ENABLE_REPLIES=YES` in the private file, restart Terminal A, and test a new `Hi` message from an authorized recipient. The webhook's `after()` should start the worker; if needed, the worker can be called directly on localhost with its secret, never through the tunnel.

## Stop

Ctrl-C in all three terminals. Quick Tunnel URLs change on restart and should not be used for production.
