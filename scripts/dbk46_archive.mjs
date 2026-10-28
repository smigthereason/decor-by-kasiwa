#!/usr/bin/env node
// DBK-46: Copy immutable historical auditEvent/staffSession snapshots to Neon.
// Default READ ONLY. Explicit checksum confirmation needed for Neon archive-only writes.
// Never modifies Sanity, existing inventory archive, stock, finance workflows, or auth.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOW = new Set(['auditEvent', 'staffSession']);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
const [file, ...flags] = process.argv.slice(2);
const usage = 'Usage: node scripts/dbk46_archive.mjs /private/export.tar.gz [--apply --confirm-sha256=64HEX]';
const apply = flags.includes('--apply');
const confirmFlag = flags.find(s => s.startsWith('--confirm-sha256='));
if (!file || file.startsWith('--') || !existsSync(file) || flags.some(s => s !== '--apply' && !s.startsWith('--confirm-sha256=')) || flags.filter(s => s.startsWith('--confirm-sha256=')).length > 1 || (!apply && confirmFlag)) {
  console.error(usage); process.exit(2);
}
if (apply && (!confirmFlag || !/^[a-f0-9]{64}$/i.test(confirmFlag.slice(17)))) {
  console.error('STOP: --apply requires --confirm-sha256=<64-character hash from dry run>'); process.exit(2);
}
if (apply && process.env.DBK46_ARCHIVE_TARGET !== 'neon-production') {
  console.error('STOP: explicit DBK46_ARCHIVE_TARGET=neon-production acknowledgement required'); process.exit(2);
}
const extractor = join(dirname(fileURLToPath(import.meta.url)), 'dbk46_extract.py');
if (!existsSync(extractor)) { console.error('STOP: dbk46_extract.py must sit beside dbk46_archive.mjs'); process.exit(2); }
async function fileDigest(p) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(p)) h.update(chunk);
  return h.digest('hex');
}
const checksum = await fileDigest(file);
if (apply && checksum !== confirmFlag.slice(17).toLowerCase()) {
  console.error('STOP: export checksum differs from the reviewed dry run'); process.exit(2);
}
const child = spawn('python3', [extractor, resolve(file)], { stdio: ['ignore', 'pipe', 'pipe'] });
let err = '';
child.stderr.setEncoding('utf8'); child.stderr.on('data', d => { err += d; });
const completed = new Promise((accept, reject) => {child.on('close', accept); child.on('error', reject);});
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
const source = new Map();
const counts = {auditEvent: 0, staffSession: 0};
let bytes = 0;
try {
  for await (const line of lines) {
    const doc = JSON.parse(line);
    if (!ALLOW.has(doc._type) || !doc._id) throw new Error('Extractor returned unexpected record');
    const id = JSON.stringify([doc._type, doc._id]);
    if (source.has(id)) throw new Error('Source export contains duplicate document IDs');
    const encoded = JSON.stringify(canonical(doc));
    bytes += Buffer.byteLength(encoded);
    source.set(id, {document_type:doc._type, sanity_id:doc._id,
      source_revision:doc._rev || null,
      source_created_at:doc._createdAt || null,
      source_updated_at:doc._updatedAt || null,
      source_sha256:createHash('sha256').update(encoded).digest('hex'),
      document_json:doc});
    counts[doc._type] += 1;
    if (source.size > 50000) throw new Error('Unexpected >50,000 selected documents');
  }
  if (await completed !== 0) throw new Error(`Extractor failed: ${err.trim().slice(0,160)}`);
  if (!source.size) throw new Error('No auditEvent/staffSession documents in export');
  const summary = {stage:'DBK-46', mode: apply ? 'NEON ARCHIVE ONLY' : 'READ ONLY DRY RUN',
    backupSha256:checksum, sourceCounts:counts, selectedDocuments:source.size,
    serializedMiB:Number((bytes/1048576).toFixed(2)),
    sanityWrites:0, stockWrites:0, paymentWrites:0, deletionPermission:false};
  if (!process.env.DATABASE_URL) {
    if (apply) throw new Error('DATABASE_URL missing');
    summary.note='No DATABASE_URL provided: offline source-only check';
    console.log(JSON.stringify(summary,null,2)); process.exit(0);
  }
  const {neon} = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  const [state] = await sql`SELECT to_regclass('public.dbk_sanity_operational_archive') AS table_name,
    pg_database_size(current_database())::bigint AS used_bytes`;
  if (!state.table_name) throw new Error('Archive table missing; run dbk46-neon-schema.sql first');
  if (Number(state.used_bytes) >= 800 * 1024 * 1024) throw new Error('Neon DB exceeds 800 MiB safety threshold');
  const existing = await sql`SELECT document_type, sanity_id, source_revision, source_sha256 FROM public.dbk_sanity_operational_archive`;
  const archived = new Map(existing.map(r => [JSON.stringify([r.document_type,r.sanity_id]), r]));
  const inserts = []; let matched=0, conflicts=0;
  for (const [k,row] of source) {
    const old=archived.get(k);
    if (!old) inserts.push(row);
    else if (old.source_sha256===row.source_sha256 && (old.source_revision||null)===(row.source_revision||null)) matched++;
    else conflicts++;
  }
  summary.currentArchiveRecords=existing.length;
  summary.alreadyMatching=matched;
  summary.toInsert=inserts.length;
  summary.conflictingRevisionsOrBodies=conflicts;
  summary.archiveIdsAbsentInSnapshot=existing.filter(r=>!source.has(JSON.stringify([r.document_type,r.sanity_id]))).length;
  summary.safeToApply=conflicts===0;
  if (!apply) {
    console.log(JSON.stringify(summary,null,2));
    process.exit(conflicts ? 1 : 0);
  }
  if (conflicts) throw new Error('Snapshot conflicts with existing archives; nothing written');
  const url=new URL(process.env.DATABASE_URL);
  // Prevent accidental import to known ephemeral test connection.
  const testEnvPath=resolve('.env.dbk45-test.local');
  if (existsSync(testEnvPath)) {
    const line=readFileSync(testEnvPath,'utf8').split(/\r?\n/).find(s=>s.startsWith('DATABASE_URL='));
    if (line) {
      const testUrl=line.substring('DATABASE_URL='.length).trim().replace(/^["']|["']$/g,'');
      if (new URL(testUrl).hostname===url.hostname) throw new Error('Target is DBK-45 temporary test branch; STOP');
    }
  }
  let inserted=0;
  const BATCH=100;
  for (let i=0;i<inserts.length;i+=BATCH) {
    const batch = JSON.stringify(inserts.slice(i,i+BATCH));
    const out = await sql`INSERT INTO public.dbk_sanity_operational_archive
      (document_type,sanity_id,source_revision,source_created_at,source_updated_at,source_sha256,document_json)
      SELECT r.document_type,r.sanity_id,r.source_revision,r.source_created_at,r.source_updated_at,r.source_sha256,r.document_json
      FROM jsonb_to_recordset(${batch}::jsonb) AS r (
        document_type text,sanity_id text,source_revision text,
        source_created_at timestamptz,source_updated_at timestamptz,source_sha256 text,document_json jsonb)
      ON CONFLICT (document_type,sanity_id) DO NOTHING RETURNING sanity_id`;
    inserted+=out.length;
  }
  summary.insertedThisRun=inserted;
  summary.note='Archive COPY only. Originals still needed by live Sanity app. Do not delete.';
  console.log(JSON.stringify(summary,null,2));
  if (inserted!==inserts.length) throw new Error('Insert count mismatch: inspect archive before retrying');
  if ((await fileDigest(file))!==checksum) throw new Error('Backup file changed while importing; investigate');
} catch (e) {
  child.kill('SIGTERM');
  console.error('STOP:', e?.message ?? 'unknown failure'); process.exitCode=1;
}
