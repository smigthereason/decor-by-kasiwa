import "server-only";

import { serverClient } from "@/sanity/lib/serverClient";
import { isLocalReadOnlyStaffAuth } from "@/lib/auth/sanity-client-policy";
import type { SanityCustomer } from "@/lib/auth/sanity-users";

/**
 * Viewer-token-only, development-only reads for DBK-36 staff login.
 * No account creation, linking, role updates or customer mutations.
 * The returned identity is still validated by the existing Google policy
 * and the protected admin route's active-role guard.
 */
function assertLocalReadOnlyMode() {
  if (!isLocalReadOnlyStaffAuth(process.env) || process.env.VERCEL_ENV) {
    throw new Error("Local read-only staff lookup is unavailable.");
  }
}

const fields = `{
  _id, name, email, googleId, role, status, image,
  createdAt, updatedAt, lastLoginAt
}`;

export async function getLocalReadOnlyGoogleCustomer(googleId: string): Promise<SanityCustomer | null> {
  assertLocalReadOnlyMode();
  if (!googleId || googleId.length > 256) return null;
  return serverClient.fetch<SanityCustomer | null>(
    `*[_type == "customerUser" && googleId == $googleId] | order(_updatedAt desc)[0]${fields}`,
    { googleId },
    { cache: "no-store" },
  );
}

export async function getLocalReadOnlyCustomerById(id: string): Promise<SanityCustomer | null> {
  assertLocalReadOnlyMode();
  if (!id || id.length > 256 || id.startsWith("drafts.")) return null;
  return serverClient.fetch<SanityCustomer | null>(
    `*[_type == "customerUser" && _id == $id][0]${fields}`,
    { id },
    { cache: "no-store" },
  );
}
