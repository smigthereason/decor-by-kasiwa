/** DBK-36I: production messaging and catalogue sync gates. Pure: no network or secrets exposed. */

type Environment = Record<string, string | undefined>;

// Must remain aligned with DBK-74's enforced production database identity.
export const DBK36_PRODUCTION_DB_HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';

export function isProductionDatabase(databaseUrl: string | undefined): boolean {
  try {
    const url = new URL(databaseUrl || '');
    return ['postgres:', 'postgresql:'].includes(url.protocol) &&
      url.hostname === DBK36_PRODUCTION_DB_HOST &&
      decodeURIComponent(url.pathname.slice(1)) === 'neondb';
  } catch { return false; }
}

export function isProductionRuntime(env: Environment): boolean {
  // Cloudflare is an independently verified production deployment, never a fake Vercel environment.
  const vercel = env.VERCEL_ENV === 'production' && env.DBK36_CLOUDFLARE_DEPLOYMENT !== 'YES';
  const cloudflare = env.DBK36_CLOUDFLARE_DEPLOYMENT === 'YES' && !env.VERCEL_ENV;
  return env.NODE_ENV === 'production' && (vercel || cloudflare) &&
    env.DBK36_TEST_WEBHOOK_BYPASS !== 'YES' &&
    env.DBK36_TEST_READ_ONLY_STAFF_AUTH !== 'YES' &&
    isProductionDatabase(env.DATABASE_URL);
}

function normalizedNumber(number: string): string | null {
  const cleaned = number.trim().replace(/^\+/, '');
  return /^\d{8,15}$/.test(cleaned) ? cleaned : null;
}

function approvedTestRecipient(to: string, env: Environment): boolean {
  const recipient = normalizedNumber(to);
  if (!recipient) return false;
  return (env.WHATSAPP_TEST_RECIPIENTS || '').split(',')
    .map(n => normalizedNumber(n)).some(n => n !== null && n === recipient);
}

function productionPhoneMatches(env: Environment): boolean {
  const expected = env.DBK36_PRODUCTION_PHONE_NUMBER_ID?.trim();
  const configured = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  return Boolean(expected && configured && expected === configured && /^\d{8,30}$/.test(expected!));
}

/** Both customer messaging and manual staff replies remain fail-closed in production. */
export function isLiveSendingApproved(env: Environment): boolean {
  return isProductionRuntime(env) && productionPhoneMatches(env) &&
    env.DBK36_PRODUCTION_SENDING_APPROVED === 'YES' &&
    env.DBK36_PRODUCTION_LAUNCH_APPROVED === 'YES' &&
    env.WHATSAPP_BOT_ENABLED === 'YES';
}

/** Retain the recipient allowlist for development, preview, and the restricted production pilot. */
export function isAllowedWhatsAppRecipient(to: string, env: Environment): boolean {
  if (!normalizedNumber(to)) return false;
  if (env.DBK36_CLOUDFLARE_DEPLOYMENT === 'YES' || env.VERCEL_ENV === 'production' || (env.NODE_ENV === 'production' && !env.VERCEL_ENV)) {
    if (isLiveSendingApproved(env)) return true;
    return isProductionRuntime(env) && productionPhoneMatches(env) &&
      env.DBK36_PRODUCTION_PILOT_ENABLED === 'YES' && approvedTestRecipient(to, env);
  }
  return approvedTestRecipient(to, env);
}

export function isProductionSyncApproved(env: Environment): boolean {
  return isProductionRuntime(env) && env.DBK36_PRODUCTION_CATALOGUE_SYNC_ENABLED === 'YES';
}

export function isProductionMetaWebhookApproved(env: Environment): boolean {
  return isProductionRuntime(env) && env.DBK36_PRODUCTION_WEBHOOK_ENABLED === 'YES';
}

export function isProductionSanityWebhookApproved(env: Environment): boolean {
  return isProductionSyncApproved(env) && env.DBK36_SANITY_WEBHOOK_ENABLED === 'YES' &&
    Boolean(env.DBK36_SANITY_WEBHOOK_SECRET && env.DBK36_SANITY_WEBHOOK_SECRET.length >= 32);
}

/** DBK-74 exemption is ONLY for signed webhook handlers, never orders/payment/inventory writes. */
export function allowProductionDbk36WebhookPost(method: string, path: string, env: Environment): boolean {
  if (method !== 'POST') return false;
  return (path === '/api/whatsapp/webhook' && isProductionMetaWebhookApproved(env)) ||
    (path === '/api/whatsapp/catalogue/event' && isProductionSanityWebhookApproved(env));
}
