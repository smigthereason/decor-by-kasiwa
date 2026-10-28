/**
 * DBK-37 emergency quota relief utility: archive first, delete only an exact
 * allowlist of technical audit records and ended staff sessions upon approval.
 * Run through `npx sanity exec scripts/dbk37-emergency-quota-relief.ts --with-user-token`.
 * Defaults to read-only remote operations; creates a PRIVATE local archive.
 * Does not modify financial, inventory, customer, product or active-session docs.
 */
import {getCliClient} from "sanity/cli";
import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {homedir} from "node:os";
import {basename, dirname, join, resolve} from "node:path";
import {gzipSync, gunzipSync} from "node:zlib";

type SanityDocument = {
  _id: string;
  _rev: string;
  _type: string;
  _createdAt: string;
  eventType?: string;
  status?: string;
  logoutAt?: string;
  [key: string]: unknown;
};

const client = getCliClient().withConfig({apiVersion: "2026-08-27", useCdn: false, perspective: "published"});
const EVENT_TYPES = ["CLIENT_ERROR", "STAFF_LOGIN", "STAFF_LOGOUT"] as const;
const MAX_ARCHIVE_DOCS = 600;
const BATCH = 20;
const MIN_AGE_DAYS = Number(process.env.DBK_FREEUP_MIN_AGE_DAYS ?? "7");
const apply = process.env.DBK_FREEUP_APPLY === "1";
const backupDir = resolve(process.env.DBK_FREEUP_BACKUP_DIR || join(homedir(), "Downloads", "DBK-sanity-private-backups"));
const cutoff = new Date(Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

function requireCondition(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`STOP: ${message}`);
}
function hash(buffer: Buffer | string): string {
  return createHash("sha256").update(buffer).digest("hex");
}
function identityHash(documents: SanityDocument[]) {
  return hash(JSON.stringify(documents.map((d) => [d._id, d._rev]).sort((a, b) => String(a[0]).localeCompare(String(b[0])))));
}
function allowed(doc: SanityDocument): boolean {
  if (!doc || !doc._id || !doc._rev || doc._id.startsWith("drafts.")) return false;
  if (doc._type === "auditEvent") {
    return EVENT_TYPES.includes(doc.eventType as (typeof EVENT_TYPES)[number])
      && typeof doc._createdAt === "string" && doc._createdAt < cutoff;
  }
  return doc._type === "staffSession" && doc.status === "ENDED"
    && typeof doc.logoutAt === "string" && doc.logoutAt < cutoff;
}
async function fetchCandidates(): Promise<SanityDocument[]> {
  const query = `*[
    (_type == "auditEvent" && eventType in $types && _createdAt < $cutoff) ||
    (_type == "staffSession" && status == "ENDED" && defined(logoutAt) && logoutAt < $cutoff)
  ] | order(_id asc)[0...650]`;
  const records = await client.fetch<SanityDocument[]>(query, {types: [...EVENT_TYPES], cutoff});
  requireCondition(Array.isArray(records), "Cannot read cleanup candidates.");
  requireCondition(records.length <= MAX_ARCHIVE_DOCS, "Candidate count exceeds the 600-record safety cap; no changes.");
  requireCondition(records.every(allowed), "Unexpected document in candidate list; no changes.");
  requireCondition(new Set(records.map((record) => record._id)).size === records.length, "Duplicate IDs; no changes.");
  return records;
}
function summary(documents: SanityDocument[]) {
  const counts: Record<string, number> = {};
  for (const item of documents) {
    const key = item._type === "auditEvent" ? item.eventType || "UNKNOWN" : "ENDED_STAFF_SESSION";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
function readArchive(filePath: string): SanityDocument[] {
  const bytes = readFileSync(filePath);
  const raw = gunzipSync(bytes).toString("utf8");
  const docs = raw.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as SanityDocument);
  requireCondition(docs.length > 0 && docs.length <= MAX_ARCHIVE_DOCS, "Archive has no valid eligible records or exceeds limit.");
  requireCondition(docs.every(allowed), "Archive contains unauthorized document type or too-new document.");
  requireCondition(new Set(docs.map((doc) => doc._id)).size === docs.length, "Duplicate document ID in archive.");
  const digest = hash(bytes);
  requireCondition(digest === process.env.DBK_FREEUP_ARCHIVE_SHA256, "Archive checksum mismatch.");
  return docs;
}
async function verifyLiveArchive(docs: SanityDocument[]) {
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    const current = await client.fetch<SanityDocument[]>(`*[_id in $ids]`, {ids: batch.map((d) => d._id)});
    requireCondition(current.length === batch.length, "One or more archived records no longer exist. Stop and re-run dry run.");
    const revs = new Map(current.map((item) => [item._id, item._rev]));
    for (const record of batch) {
      requireCondition(allowed(record) && record._rev === revs.get(record._id), `Document ${record._id} changed or is no longer eligible.`);
    }
  }
}
async function main() {
  requireCondition(Number.isInteger(MIN_AGE_DAYS) && MIN_AGE_DAYS >= 0 && MIN_AGE_DAYS <= 365, "DBK_FREEUP_MIN_AGE_DAYS must be an integer between 0 and 365.");
  const project = client.config().projectId;
  const dataset = client.config().dataset;
  requireCondition(project === "g34n810u" && dataset === "production", "Wrong Sanity project or dataset.");
  requireCondition(backupDir.startsWith(homedir() + "/"), "Backup directory must be inside the current user's home directory.");
  console.log(JSON.stringify({project, dataset, mode: apply ? "DELETE REQUESTED" : "DRY RUN + LOCAL ARCHIVE ONLY", cutoff, maxDocuments: MAX_ARCHIVE_DOCS}));
  if (!apply) {
    const docs = await fetchCandidates();
    const counts = summary(docs);
    if (docs.length === 0) {
      console.log(JSON.stringify({candidateCount: 0, counts, message: "Nothing eligible. No deletion performed."}, null, 2));
      return;
    }
    mkdirSync(backupDir, {recursive: true, mode: 0o700});
    const ndjson = docs.map((doc) => JSON.stringify(doc)).join("\n") + "\n";
    const zipped = gzipSync(Buffer.from(ndjson));
    const sha256 = hash(zipped);
    const name = `DBK-37-technical-docs-${new Date().toISOString().replace(/[:.]/g, "-")}-${sha256.slice(0, 10)}`;
    const archivePath = join(backupDir, name + ".ndjson.gz");
    writeFileSync(archivePath, zipped, {mode: 0o600, flag: "wx"});
    const manifest = {project, dataset, createdAt: new Date().toISOString(), cutoff, minAgeDays: MIN_AGE_DAYS, total: docs.length, byType: counts, archivePath, archiveSHA256: sha256, recordIdentitySHA256: identityHash(docs), isFinancialDataArchive: false, note: "Contains potentially sensitive staff activity and application errors. Store securely. No remote mutations performed."};
    writeFileSync(join(backupDir, name + ".manifest.json"), JSON.stringify(manifest, null, 2) + "\n", {mode: 0o600, flag: "wx"});
    console.log(JSON.stringify({mode: "DRY RUN — NO DELETIONS", candidateCount: docs.length, byType: counts, cutoff, archivePath, archiveSHA256: sha256, note: "Review backup and eligibility. A separate explicit APPLY command is required. Project-wide quota counts may include other datasets."}, null, 2));
    return;
  }
  requireCondition(process.env.DBK_FREEUP_CONFIRM === "DELETE-ONLY-ARCHIVED-TECHNICAL-LOGS", "Explicit confirmation missing. No changes.");
  requireCondition((process.env.DBK_FREEUP_OPERATOR || "").trim().length >= 3, "Record the actual authorized operator name.");
  const archivePath = resolve(process.env.DBK_FREEUP_ARCHIVE || "");
  requireCondition(archivePath.startsWith(backupDir + "/") && basename(archivePath).endsWith(".ndjson.gz") && existsSync(archivePath), "Use the exact verified archive inside the private backup directory.");
  requireCondition(!!process.env.DBK_FREEUP_ARCHIVE_SHA256, "Archive SHA256 is required.");
  const docs = readArchive(archivePath);
  await verifyLiveArchive(docs);
  console.log(`Archive verified; ${docs.length} allowlisted technical documents will be deleted. Operator: ${process.env.DBK_FREEUP_OPERATOR}`);
  let deleted = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    const current = await client.fetch<SanityDocument[]>(`*[_id in $ids]`, {ids: batch.map((item) => item._id)});
    const revs = new Map(current.map((item) => [item._id, item._rev]));
    requireCondition(current.length === batch.length && batch.every((item) => allowed(item) && revs.get(item._id) === item._rev), "Batch changed since archive; stopping before further deletes.");
    const tx = client.transaction();
    for (const doc of batch) tx.delete(doc._id);
    await tx.commit();
    deleted += batch.length;
    console.log(`Deleted ${deleted}/${docs.length} approved technical records.`);
  }
  console.log(JSON.stringify({mode: "DELETE COMPLETE", deleted, byType: summary(docs), archivePath, operator: process.env.DBK_FREEUP_OPERATOR, note: "No financial, product, inventory or customer records selected. Confirm quota has updated before retrying POS."}, null, 2));
}
main().catch((error) => {console.error(error); process.exitCode = 1;});
