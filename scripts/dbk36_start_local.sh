#!/usr/bin/env bash
# Run DBK-36 Next.js against isolated Neon branch without changing .env.local.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
config="${HOME}/.config/dbk36/whatsapp-test.env"
if [[ ! -f "$config" ]]; then
  echo "Missing $config. See docs/DBK-36-LOCAL-TUNNEL.md" >&2
  exit 1
fi
# Require owner-only secret file.
mode=$(stat -f '%Lp' "$config")  # macOS stat
if [[ "$mode" != 600 ]]; then
  echo "Use chmod 600 '$config' before running" >&2
  exit 1
fi
set -a
# The private file is authored by the operator and must only contain trusted assignments.
# shellcheck source=/dev/null
source "$config"
set +a
for key in DATABASE_URL WHATSAPP_VERIFY_TOKEN WHATSAPP_APP_SECRET WHATSAPP_PHONE_NUMBER_ID WHATSAPP_ACCESS_TOKEN WHATSAPP_GRAPH_VERSION WHATSAPP_WORKER_SECRET; do
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required setting: $key" >&2
    exit 1
  fi
done
# Fail closed for the live Neon DB, and verify our two WhatsApp test tables.
node --input-type=module <<'JS'
import { neon } from '@neondatabase/serverless';
const url = new URL(process.env.DATABASE_URL);
const name = url.hostname.split('.')[0].replace(/-pooler$/, '');
if (!['postgresql:', 'postgres:'].includes(url.protocol) ||
    !url.hostname.endsWith('.neon.tech') ||
    name === 'ep-steep-scene-bausr4ct') {
  console.error('[DBK-36] Refusing a non-test or known production Neon URL');
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const [row] = await sql`SELECT
    to_regclass('public.dbk36_wa_conversations') IS NOT NULL AS conversations,
    to_regclass('public.dbk36_wa_messages') IS NOT NULL AS messages`;
if (!row?.conversations || !row?.messages) {
  console.error('[DBK-36] WhatsApp test schema is missing: check branch URL');
  process.exit(1);
}
console.log('[DBK-36] Test Neon and WhatsApp schema verified');
JS

export DBK36_TEST_WEBHOOK_BYPASS=YES
export WHATSAPP_BOT_ENABLED="${DBK36_ENABLE_REPLIES:-NO}"
if [[ "$WHATSAPP_BOT_ENABLED" != 'NO' && "$WHATSAPP_BOT_ENABLED" != 'YES' ]]; then
  echo '[DBK-36] DBK36_ENABLE_REPLIES must be YES or NO' >&2
  exit 1
fi
# Defense-in-depth: remove production transaction/write credentials from this process.
export PAYSTACK_SECRET_KEY=''
export MPESA_CONSUMER_KEY=''
export MPESA_CONSUMER_SECRET=''
export MPESA_PASSKEY=''
export SANITY_API_WRITE_TOKEN=''
export SMTP_PASSWORD=''
export SMTP_PASS=''
export VERCEL_ENV=''
echo "[DBK-36] Running localhost:3100, replies $WHATSAPP_BOT_ENABLED, payment/write credentials disabled"
echo '[DBK-36] Use a separate gateway on port 8787; NEVER tunnel directly to 3100.'
exec npm run dev -- -H 127.0.0.1 -p 3100
