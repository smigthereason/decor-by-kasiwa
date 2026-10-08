/**
 * Free Sanity document quota by deleting log documents only.
 *
 * Default is a dry run. Nothing is deleted until you pass --apply.
 * Safe to re-run: it only deletes documents that still match.
 *
 *   node free-document-quota.mjs
 *   node free-document-quota.mjs --apply
 *
 * Optional:
 *   --errors     also delete CLIENT_ERROR audit events
 *   --sessions   also delete staffSession heartbeat documents
 *   --unpaid     also delete unpaid orders and unpaid payment transactions
 */

import { createClient } from "@sanity/client";
import { readFileSync, existsSync } from "node:fs";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const apply = process.argv.includes("--apply");
const includeErrors = process.argv.includes("--errors");
const includeSessions = process.argv.includes("--sessions");
const includeUnpaid = process.argv.includes("--unpaid");

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID?.trim();
const dataset = (process.env.NEXT_PUBLIC_SANITY_DATASET || "production").trim();
const token = process.env.SANITY_API_WRITE_TOKEN?.trim().replace(/^['"]|['"]$/g, "");

if (!projectId || !token) {
  console.error("Missing NEXT_PUBLIC_SANITY_PROJECT_ID or SANITY_API_WRITE_TOKEN.");
  process.exit(1);
}

const client = createClient({
  projectId,
  dataset,
  apiVersion: "2026-08-27",
  token,
  useCdn: false,
  perspective: "raw",
  timeout: 120_000,
});

const filters = [
  '_type == "auditEvent" && eventType in ["STAFF_PAGE_VIEW", "STAFF_INTERACTION"]',
];
if (includeErrors) filters.push('_type == "auditEvent" && eventType == "CLIENT_ERROR"');
if (includeSessions) filters.push('_type == "staffSession"');
if (includeUnpaid) {
  filters.push('_type == "commerceOrder" && paymentStatus != "paid"');
  filters.push('_type == "paymentTransaction" && status != "paid" && status != "partially_paid"');
}

function retryable(error) {
  const code = error?.code || error?.cause?.code || "";
  const message = String(error?.message || error || "");
  return ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"].includes(code)
    || /timeout|timed out|network|fetch failed|socket/i.test(message);
}

async function withRetry(label, fn) {
  let last;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!retryable(error) || attempt === 6) throw error;
      const wait = attempt * 3000;
      console.log(`  ${label} failed (${error.code || error.message}). Retry ${attempt}/5 in ${wait / 1000}s`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw last;
}

async function count(filter) {
  return withRetry("count", () => client.fetch(`count(*[${filter}])`));
}

async function deleteMatching(filter) {
  const pending = await count(filter);
  if (!apply) return { removed: pending, pending: true };
  let removed = 0;
  for (;;) {
    const raw = await withRetry("fetch ids", () => client.fetch(`*[${filter}][0...500]._id`));
    const ids = (Array.isArray(raw) ? raw : []).filter((id) => typeof id === "string" && id.length > 0);
    if (ids.length === 0) break;
    await withRetry("delete batch", async () => {
      let tx = client.transaction();
      for (const id of ids) tx = tx.delete(id);
      // async returns as soon as the write is accepted, instead of waiting
      // for search sync. That wait is what timed out on the last run.
      await tx.commit({ visibility: "async" });
    });
    removed += ids.length;
    console.log(`  deleted ${removed} / about ${pending}`);
  }
  return { removed, pending: false };
}

const before = await withRetry("opening count", () => client.fetch('count(*[!(_id in path("_.**"))])'));
console.log(`${apply ? "APPLY" : "DRY RUN"} on ${projectId}/${dataset}`);
console.log(`Documents before: ${before}`);
console.log("Paid orders, products, categories and stock are not in this sweep.\n");

for (const filter of filters) {
  const result = await deleteMatching(filter);
  console.log(`${result.pending ? "would delete" : "deleted"} ${result.removed}  ::  ${filter}`);
}

if (apply) {
  const after = await withRetry("closing count", () => client.fetch('count(*[!(_id in path("_.**"))])'));
  console.log(`\nDocuments after: ${after}`);
  console.log(after < 25000
    ? "Under the 25,000 cap. Retry checkout, then deploy the tracker fix."
    : "Still at or over 25,000. Re-run with --errors --sessions.");
} else {
  console.log("\nDry run only. Re-run with --apply to delete.");
}
