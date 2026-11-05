/**
 * DBK-36F: read-only WhatsApp test environment diagnostics.
 *
 * This script refuses non-Neon hosts, known production endpoint, and absent
 * test-recipient allowlist using the installed DBK-36E test-only guard.
 * No UPDATE/INSERT/DELETE, no outbound WhatsApp sends, no Sanity writes.
 *
 * Usage:
 * env -u DATABASE_URL -u NODE_ENV node --env-file="$HOME/.config/dbk36/whatsapp-test.env" \
 *   scripts/dbk36_test_readiness.mjs [--meta]
 */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { getSafeTestConfig } from './dbk36_resume_test_bot.mjs';

export function freshnessStatus(syncedAt, nowMs, freshMinutes = 60, graceMinutes = 360) {
  const timestamp = syncedAt instanceof Date ? syncedAt.getTime() : Date.parse(syncedAt || '');
  if (!Number.isFinite(timestamp) || timestamp > nowMs + 60_000) return 'expired';
  const ageMin = (nowMs - timestamp) / 60_000;
  if (ageMin <= freshMinutes) return 'fresh';
  return ageMin <= Math.min(1440, freshMinutes + graceMinutes) ? 'stale' : 'expired';
}

export function assessSnapshot(snapshot, nowMs = Date.now(), env = {}) {
  const minutes = (key, fallback, min = 0) => {
    const n = Number(env[key]);
    return Number.isFinite(n) && n >= min ? Math.min(1440, Math.floor(n)) : fallback;
  };
  const freshMinutes = minutes('DBK36_CATALOGUE_MAX_AGE_MINUTES', 60, 1);
  const graceMinutes = minutes('DBK36_CATALOGUE_STALE_GRACE_MINUTES', 360);
  const catalogue = snapshot.catalogue || {};
  const productCount = Math.max(0, Number(catalogue.product_count) || 0);
  const imageCount = Math.max(0, Number(catalogue.image_count) || 0);
  const state = productCount ? freshnessStatus(catalogue.synced_at, nowMs, freshMinutes, graceMinutes) : 'missing';
  const queue = Object.fromEntries(['pending', 'processing', 'failed', 'done'].map(s =>
    [s, Math.max(0, Number(snapshot.queue?.[s]) || 0)]));
  const ageMinutes = catalogue.synced_at ? Math.round((nowMs - new Date(catalogue.synced_at).getTime()) / 60_000) : null;
  const findings = [];
  if (state === 'missing' || state === 'expired') findings.push('BLOCK: catalogue unavailable or beyond the permitted age; refresh through authenticated sync');
  else if (state === 'stale') findings.push('WARN: catalogue is stale; refresh before customer testing and verify pricing/stock');
  if (queue.failed > 0) findings.push(`WARN: ${queue.failed} inbound message(s) failed; inspect before production launch`);
  if (Number(snapshot.stuck_processing) > 0) findings.push(`WARN: ${snapshot.stuck_processing} message(s) remain processing beyond 3 minutes`);
  if (queue.pending > 0) findings.push(`CHECK: ${queue.pending} inbound message(s) are pending; inspect retries and queue worker`);
  if (productCount > 0 && imageCount === 0) findings.push('CHECK: cached products have no eligible public images; inspect image mapping');
  if (env.WHATSAPP_BOT_ENABLED !== 'YES' || env.DBK36_ENABLE_REPLIES !== 'YES') {
    findings.push('CHECK: configured bot/reply flags are not both YES in this test process');
  }
  return {
    catalogue: {
      status: state, products: productCount,
      categories: Math.max(0, Number(catalogue.category_count) || 0),
      images: Math.min(productCount, imageCount),
      imageCoveragePct: productCount ? Math.round(100 * imageCount / productCount) : 0,
      ageMinutes: Number.isFinite(ageMinutes) ? ageMinutes : null,
    },
    inboundQueue: queue,
    stuckProcessing: Math.max(0, Number(snapshot.stuck_processing) || 0),
    conversationsInHumanMode: Math.max(0, Number(snapshot.human_count) || 0),
    findings,
  };
}

export function safeMetaStatus(status, payload = {}) {
  const code = Number(payload?.error?.code);
  const subcode = Number(payload?.error?.error_subcode);
  return {
    httpStatus: status,
    phoneAccessible: status === 200 && typeof payload.id === 'string' && !!payload.id,
    errorCode: Number.isFinite(code) && code > 0 ? code : null,
    errorSubcode: Number.isFinite(subcode) && subcode > 0 ? subcode : null,
  };
}

async function checkMeta(env) {
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const phone = env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = env.WHATSAPP_GRAPH_VERSION;
  if (!token || !/^\d{8,20}$/.test(phone || '') || !/^v\d+\.\d+$/.test(graphVersion || '')) {
    return { status: 'not_checked', reason: 'Missing or invalid Meta configuration' };
  }
  try {
    const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(phone)}?fields=id`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    // Do not print raw error bodies; they can contain identifiers and metadata.
    const body = await response.json().catch(() => ({}));
    return safeMetaStatus(response.status, body);
  } catch {
    return { status: 'network_error', reason: 'Meta read-only check failed' };
  }
}

export async function main(env = process.env, argv = process.argv.slice(2)) {
  if (argv.length === 1 && argv[0] === '--help') {
    console.log('DBK-36F test readiness: [--meta] optional Meta read-only token check. Test Neon only.');
    return;
  }
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== '--meta')) {
    throw new Error('Supported options: no arguments, --meta, or --help');
  }
  const safe = getSafeTestConfig(env);
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(safe.databaseUrl);
  // All queries are SELECTs and do not include message contents or phone numbers.
  const [catalogueRows, queueRows, stuckRows, humanRows] = await Promise.all([
    sql`SELECT cache.synced_at,
          jsonb_array_length(cache.products_json)::int AS product_count,
          (SELECT COUNT(DISTINCT product.obj->>'category')::int
             FROM jsonb_array_elements(cache.products_json) AS product(obj)) AS category_count,
          (SELECT COUNT(*)::int
             FROM jsonb_array_elements(cache.products_json) AS product(obj)
            WHERE COALESCE(product.obj->>'imageUrl','') <> '') AS image_count
        FROM public.dbk36_wa_catalogue_cache cache WHERE cache.cache_key='ecommerce' LIMIT 1`,
    sql`SELECT status, count(*)::int AS total FROM public.dbk36_wa_messages
         WHERE direction='in' GROUP BY status`,
    sql`SELECT count(*)::int AS count FROM public.dbk36_wa_messages
         WHERE direction='in' AND status='processing' AND claimed_at < now() - interval '3 minutes'`,
    sql`SELECT count(*)::int AS count FROM public.dbk36_wa_conversations WHERE mode='human'`,
  ]);
  const snapshot = {
    catalogue: catalogueRows[0] || null,
    queue: Object.fromEntries(queueRows.map(row => [row.status, row.total])),
    stuck_processing: stuckRows[0]?.count || 0,
    human_count: humanRows[0]?.count || 0,
  };
  const report = assessSnapshot(snapshot, Date.now(), env);
  if (argv.includes('--meta')) report.meta = await checkMeta(env);
  console.log('DBK-36F READ-ONLY TEST READINESS');
  console.log(JSON.stringify(report, null, 2));
  console.log('NOTE: This tests data health, not live message delivery, admin access, or production readiness.');
}

const direct = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (direct) {
  main().catch(() => {
    // Never leak database URL, access tokens, raw provider errors or personal data.
    console.error('[DBK-36F] Read-only check stopped. Confirm test Neon, schema, network and required variables.');
    process.exitCode = 1;
  });
}
