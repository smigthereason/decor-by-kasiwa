# DBK-36 production source parity (v23.2)

This source was reconstructed from the SHA-pinned v23.2 production release package.
The main Next.js application code is copied **byte-for-byte** from the release:
- v21 staff-paid intake, fulfillment and stock planner
- v22 admin-only AI shopping demo
- v23.2 production-native checkout, verified Daraja reconciliation, deduplicated
  stock claim, catalogue, inbound queue and callback routes

The Cloudflare Worker source is retained at `infra/dbk36/production-worker/`.
Production Cloudflare deployment remains separate; committing its source does
**not** redeploy the Worker, change credentials or turn on WhatsApp.

The SQL files under `migration/dbk36/` are **historical provenance only**.
DO NOT reapply them to an already-migrated Neon production database.
Production app flags, official WhatsApp number, API secrets, payments and
stock data are never stored in this source package.

The live site is currently a separately promoted Vercel production deployment.
Before pushing the merged `main` to GitHub, verify a production-equivalent
Vercel build and all routes against that live version; a GitHub push can trigger
a new deployment and potentially replace the existing website code.

The original `feat/dbk36-whatsapp-agent` branch contains additional development
work and was **not** merged wholesale. Review that branch separately; do not
overwrite production backend code with its earlier staging implementation.
