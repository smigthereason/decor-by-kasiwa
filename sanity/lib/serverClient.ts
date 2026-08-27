import "server-only";

import { createClient } from "@sanity/client";

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
const token = process.env.SANITY_API_WRITE_TOKEN;

if (!projectId) {
  throw new Error("NEXT_PUBLIC_SANITY_PROJECT_ID is missing.");
}

if (!token) {
  throw new Error("SANITY_API_WRITE_TOKEN is missing.");
}

export const serverClient = createClient({
  projectId,
  dataset,
  apiVersion: "2026-08-27",
  useCdn: false,
  token,
  perspective: "published",
});
