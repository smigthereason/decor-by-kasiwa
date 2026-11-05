/**
 * Restrictive, development-only authorization for an existing Google-linked
 * Sanity ADMIN. No email-only linking and no account creation are permitted.
 * The normal production sign-in callback remains unchanged.
 */
type ExistingAccount = {
  googleId?: string | null;
  email?: string | null;
  status?: string | null;
  role?: string | null;
} | null | undefined;

function normalizeEmail(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

export function isExistingReadOnlyAdminGoogleAccount(
  account: ExistingAccount,
  oauthGoogleId: string,
  oauthEmail: string,
): boolean {
  return Boolean(
    account &&
    oauthGoogleId &&
    account.googleId === oauthGoogleId &&
    account.status === "ACTIVE" &&
    account.role === "ADMIN" &&
    normalizeEmail(account.email) &&
    normalizeEmail(account.email) === normalizeEmail(oauthEmail),
  );
}
