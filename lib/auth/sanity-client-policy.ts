/**
 * Server-only credential selection for the Sanity customer auth client.
 * Production keeps its existing write-token requirement. A local development
 * session may opt into Viewer-token based staff authentication, with ALL
 * Sanity mutations disabled in the client facade.
 */
export type SanityEnvironment = Record<string, string | undefined>;

function clean(value: string | undefined) {
  return (value || "").trim().replace(/^['"]|['"]$/g, "");
}

export function isLocalReadOnlyStaffAuth(env: SanityEnvironment): boolean {
  return (
    env.NODE_ENV === "development" &&
    env.DBK36_TEST_READ_ONLY_STAFF_AUTH === "YES" &&
    !clean(env.SANITY_API_WRITE_TOKEN) &&
    Boolean(clean(env.SANITY_API_READ_TOKEN))
  );
}

export function resolveSanityServerConfig(env: SanityEnvironment) {
  const projectId = clean(env.NEXT_PUBLIC_SANITY_PROJECT_ID);
  const dataset = clean(env.NEXT_PUBLIC_SANITY_DATASET) || "production";
  const writeToken = clean(env.SANITY_API_WRITE_TOKEN);
  const readToken = clean(env.SANITY_API_READ_TOKEN);

  if (!projectId) {
    throw new Error("NEXT_PUBLIC_SANITY_PROJECT_ID is missing.");
  }

  if (writeToken) {
    return { projectId, dataset, token: writeToken, readOnly: false as const };
  }
  if (isLocalReadOnlyStaffAuth(env) && readToken) {
    return { projectId, dataset, token: readToken, readOnly: true as const };
  }
  throw new Error(
    "Sanity staff authentication is unavailable. " +
    "Production requires SANITY_API_WRITE_TOKEN; " +
    "local WhatsApp test can opt into a Viewer-only SANITY_API_READ_TOKEN."
  );
}

const MUTATION_METHODS = new Set([
  "create", "createIfNotExists", "createOrReplace", "delete", "patch",
  "transaction", "mutate", "action", "request", "withConfig", "clone",
]);

export function blocksSanityMutation(method: PropertyKey): boolean {
  return typeof method === "string" && MUTATION_METHODS.has(method);
}
