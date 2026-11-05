/**
 * DBK-36 Cloudflare-only HTTP perimeter.
 * Pure functions allow test coverage without running Next.js or contacting services.
 * Only DBK-36 routes are public. Checkout/POS/Admin/NextAuth never reach the app.
 */
const PROD_HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';

export function matchesApprovedProductionDb(connectionString) {
  try {
    const url = new URL(connectionString || '');
    return (url.protocol === 'postgresql:' || url.protocol === 'postgres:') &&
      url.hostname === PROD_HOST &&
      decodeURIComponent(url.pathname.slice(1)) === 'neondb';
  } catch {
    return false;
  }
}

export function isVerifiedCloudflareRuntime(env) {
  return env.DBK36_CLOUDFLARE_DEPLOYMENT === 'YES' &&
    env.NODE_ENV === 'production' &&
    !env.VERCEL_ENV &&
    env.DBK36_TEST_WEBHOOK_BYPASS !== 'YES' &&
    env.DBK36_TEST_READ_ONLY_STAFF_AUTH !== 'YES' &&
    matchesApprovedProductionDb(env.DATABASE_URL);
}

function approvedPhone(env) {
  const id = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  return Boolean(id && /^\d{8,30}$/.test(id) && id === env.DBK36_PRODUCTION_PHONE_NUMBER_ID?.trim());
}

export function routeDecision(method, pathname, env) {
  if (method === 'GET' && pathname === '/__dbk36/health') return 'health';
  if (!isVerifiedCloudflareRuntime(env) || !approvedPhone(env)) return 'deny';
  if (pathname === '/api/whatsapp/webhook' &&
      (method === 'GET' || method === 'POST') &&
      env.DBK36_PRODUCTION_WEBHOOK_ENABLED === 'YES') return 'allow';
  if (pathname === '/api/whatsapp/catalogue/event' && method === 'POST' &&
      env.DBK36_PRODUCTION_CATALOGUE_SYNC_ENABLED === 'YES' &&
      env.DBK36_SANITY_WEBHOOK_ENABLED === 'YES' &&
      (env.DBK36_SANITY_WEBHOOK_SECRET?.length || 0) >= 32) return 'allow';
  return 'deny';
}

/** Worker Cron calls private Next.js route handlers directly, not via public HTTP. */
export function cronTarget(cron, env) {
  if (!isVerifiedCloudflareRuntime(env) || !approvedPhone(env)) return null;
  if (cron === '*/5 * * * *' && env.WHATSAPP_BOT_ENABLED === 'YES' &&
      (env.DBK36_PRODUCTION_PILOT_ENABLED === 'YES' ||
        (env.DBK36_PRODUCTION_SENDING_APPROVED === 'YES' &&
         env.DBK36_PRODUCTION_LAUNCH_APPROVED === 'YES'))) {
    return '/api/whatsapp/process';
  }
  if (cron === '*/30 * * * *' && env.DBK36_PRODUCTION_CATALOGUE_SYNC_ENABLED === 'YES') {
    return '/api/whatsapp/catalogue/sync';
  }
  return null;
}
