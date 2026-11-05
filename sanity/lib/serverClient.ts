import "server-only";

import { createClient, type SanityClient } from "@sanity/client";
import { blocksSanityMutation, resolveSanityServerConfig } from "@/lib/auth/sanity-client-policy";

let resolvedClient: SanityClient | null = null;
let readOnly = false;

function getClient(): SanityClient {
  if (!resolvedClient) {
    // Do not require privileged Sanity credentials at module evaluation time.
    // The WhatsApp webhook can run without loading the admin login service.
    const settings = resolveSanityServerConfig(process.env);
    readOnly = settings.readOnly;
    resolvedClient = createClient({
      projectId: settings.projectId,
      dataset: settings.dataset,
      apiVersion: "2026-08-27",
      useCdn: false,
      token: settings.token,
      perspective: "published",
    });
  }
  return resolvedClient;
}

// Preserve the existing SanityClient API so all existing call sites continue
// working, but defer credentials until an authenticated operation needs them.
export const serverClient: SanityClient = new Proxy({} as SanityClient, {
  get(_target, property) {
    const client = getClient();
    if (readOnly && blocksSanityMutation(property)) {
      return () => {
        throw new Error("Sanity write operation prohibited in read-only WhatsApp test mode.");
      };
    }
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
