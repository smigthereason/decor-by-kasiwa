/**
 * DBK-36 local test exception for NextAuth's POST-based sign-in handshake.
 * Keeps production DBK-74 checkout and business-write barriers unchanged.
 * This intentionally permits no business or back-office mutation routes.
 */
type Env = Record<string, string | undefined>;
const PROD_DB_HOST = "ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech";
const allowedPosts = new Set([
  "/api/auth/signin/google",
  "/api/auth/signin/credentials",
  "/api/auth/callback/credentials",
  "/api/auth/signout",
]);

function testDatabase(urlText: string | undefined): boolean {
  try {
    const url = new URL(urlText || "");
    return (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      url.hostname.endsWith(".neon.tech") &&
      url.hostname !== PROD_DB_HOST &&
      decodeURIComponent(url.pathname.slice(1)) === "neondb";
  } catch {
    return false;
  }
}

export function allowLocalReadOnlyStaffAuthPost(method: string, pathname: string, env: Env): boolean {
  return method === "POST" &&
    allowedPosts.has(pathname) &&
    env.NODE_ENV === "development" &&
    !env.VERCEL_ENV &&
    env.DBK36_TEST_WEBHOOK_BYPASS === "YES" &&
    env.DBK36_TEST_READ_ONLY_STAFF_AUTH === "YES" &&
    Boolean(env.SANITY_API_READ_TOKEN?.trim()) &&
    !env.SANITY_API_WRITE_TOKEN?.trim() &&
    testDatabase(env.DATABASE_URL);
}


/**
 * DBK-36G7: A strictly local, isolated-Neon exception for staff-managed
 * WhatsApp test conversations. The route itself still enforces an active ADMIN
 * session, same-origin requests, and validates its action/body. No checkout,
 * stock, orders, activity, or arbitrary WhatsApp paths are exempted here.
 */
export function allowLocalWhatsAppStaffTestPost(method: string, pathname: string, env: Env): boolean {
  if (method !== "POST") return false;
  const match = /^\/api\/backoffice\/whatsapp\/(\d{8,15})$/.exec(pathname);
  if (!match) return false;
  if (env.NODE_ENV !== "development" || env.VERCEL_ENV) return false;
  if (env.DBK36_TEST_WEBHOOK_BYPASS !== "YES") return false;
  if (env.DBK36_TEST_READ_ONLY_STAFF_AUTH !== "YES") return false;
  if (!env.SANITY_API_READ_TOKEN?.trim() || env.SANITY_API_WRITE_TOKEN?.trim()) return false;
  if (!testDatabase(env.DATABASE_URL)) return false;

  const approved = (env.WHATSAPP_TEST_RECIPIENTS || "")
    .split(",")
    .map(value => value.trim().replace(/^\+/, ""))
    .filter(value => /^\d{8,15}$/.test(value));
  return approved.length > 0 && approved.includes(match[1]);
}


/**
 * DBK-36G8: Repair a local reverse-proxy host mismatch for browser-originated
 * staff WhatsApp POSTs, without weakening ordinary same-origin enforcement.
 * Only allows the documented local 127.0.0.1:3100 origin as a fallback when
 * the exact allowlisted/test-branch DBK-36G7 policy is already satisfied.
 * Production and unapproved conversations never use the fallback.
 */
export function isPermittedWhatsAppStaffOrigin(
  origin: string | null,
  requestUrl: string,
  method: string,
  env: Env,
): boolean {
  if (!origin) return false;
  try {
    const claimed = new URL(origin);
    if (origin !== claimed.origin) return false;
    const incoming = new URL(requestUrl);
    // Existing behavior: ordinary same-origin browser POSTs are accepted.
    if (claimed.origin === incoming.origin) return true;

    const localOrigin = 'http://127.0.0.1:3100';
    return claimed.origin === localOrigin &&
      env.NEXTAUTH_URL === localOrigin &&
      allowLocalWhatsAppStaffTestPost(method, incoming.pathname, env);
  } catch {
    return false;
  }
}
