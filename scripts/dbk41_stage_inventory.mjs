#!/usr/bin/env node
// DBK-41: offline Sanity inventory-movement snapshot into a NEW Neon archive table.
// Dry run is DEFAULT. Only --apply writes. Never deletes/changes Sanity documents.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const usage = 'Usage: node scripts/dbk41_stage_inventory.mjs /private/path/export.tar.gz [--apply]';
const archive = process.argv[2];
const flags = process.argv.slice(3);
if (!archive || archive.startsWith('--') || flags.some(f => f !== '--apply') || flags.length > 1) {
  console.error(usage);
  process.exit(2);
}
const apply = flags.includes('--apply');
if (!fs.existsSync(archive)) {
  console.error('STOP: archive file not found');
  process.exit(2);
}
const extractScript = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dbk41_extract_inventory.py');
if (!fs.existsSync(extractScript)) {
  console.error('STOP: put both DBK-41 scripts in the same scripts/ directory');
  process.exit(2);
}

let sql;
if (apply) {
  if (!process.env.DATABASE_URL) {
    console.error('STOP: DATABASE_URL not configured');
    process.exit(2);
  }
  const { neon } = await import('@neondatabase/serverless');
  sql = neon(process.env.DATABASE_URL);
  const table = await sql`SELECT to_regclass('public.dbk_inventory_movement_archive') AS archive_table,
    pg_database_size(current_database())::bigint AS db_bytes`;
  if (!table[0]?.archive_table) {
    console.error('STOP: run dbk41-neon-schema.sql in Neon first');
    process.exit(2);
  }
  if (Number(table[0]?.db_bytes) >= 800 * 1024 * 1024) {
    console.error('STOP: database already above 800 MiB safety limit');
    process.exit(2);
  }
}

const child = spawn('python3', [extractScript, archive], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {...process.env, PYTHONUNBUFFERED: '1'},
});
let extractorError = '';
child.stderr.setEncoding('utf8');
child.stderr.on('data', chunk => { extractorError += chunk; });
const ended = new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', resolve);
});
const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
let total = 0, approxBytes = 0, newlyInserted = 0;
let batch = [];
const ids = new Set();
const sha = s => createHash('sha256').update(s).digest('hex');
const hash = createHash('sha256');
const BATCH_SIZE = 50;
async function flush() {
  if (!apply || batch.length === 0) { batch = []; return; }
  const json = JSON.stringify(batch);
  const result = await sql`INSERT INTO dbk_inventory_movement_archive
    (sanity_id, source_revision, source_created_at, source_updated_at, source_sha256, document_json)
    SELECT r.sanity_id, r.source_revision, r.source_created_at, r.source_updated_at,
      r.source_sha256, r.document_json
    FROM jsonb_to_recordset(${json}::jsonb) AS r(
      sanity_id text, source_revision text, source_created_at timestamptz,
      source_updated_at timestamptz, source_sha256 text, document_json jsonb
    )
    ON CONFLICT (sanity_id) DO NOTHING
    RETURNING sanity_id`;
  newlyInserted += result.length;
  batch = [];
}

try {
  for await (const line of lines) {
    const doc = JSON.parse(line);
    if (doc._type !== 'inventoryMovement' || typeof doc._id !== 'string' || !doc._id.startsWith('inventoryMovement.')) {
      throw new Error('Unexpected document in the inventory-only extractor');
    }
    if (ids.has(doc._id)) throw new Error('Duplicate ID in source export');
    ids.add(doc._id);
    const encoded = JSON.stringify(doc);
    hash.update(doc._id + '\0' + (doc._rev || '') + '\0' + sha(encoded) + '\n');
    total += 1;
    approxBytes += Buffer.byteLength(encoded);
    if (apply) {
      batch.push({sanity_id: doc._id, source_revision: doc._rev || null,
        source_created_at: doc._createdAt || null, source_updated_at: doc._updatedAt || null,
        source_sha256: sha(encoded), document_json: doc });
      if (batch.length >= BATCH_SIZE) await flush();
    }
  }
  const exitCode = await ended;
  if (exitCode !== 0) throw new Error('Backup extraction failed (no source files changed)');
  if (total < 1) throw new Error('No inventoryMovement records found');
  if (apply) await flush();
  console.log('DBK-41 inventoryMovement archival ' + (apply ? 'COPY COMPLETE' : 'DRY RUN'));
  console.log('Snapshot documents:', total);
  console.log('Snapshot serialized MiB:', (approxBytes / 1048576).toFixed(2));
  console.log('Snapshot checksum:', hash.digest('hex'));
  if (apply) {
    const [{count, db_bytes}] = await sql`SELECT count(*)::bigint AS count,
      pg_database_size(current_database())::bigint AS db_bytes
      FROM dbk_inventory_movement_archive`;
    console.log('New records inserted this run:', newlyInserted);
    console.log('Archive table records:', Number(count));
    console.log('Neon database size (MiB):', (Number(db_bytes) / 1048576).toFixed(2));
    if (Number(count) < total) throw new Error('Archive count below snapshot count; investigate before any cutover');
  }
  console.log('Sanity modifications: NONE. Production cutover: NONE. Deletion permission: NONE.');
} catch (err) {
  child.kill('SIGTERM');
  console.error('STOP:', err?.message || 'Unable to complete staging');
  process.exitCode = 1;
}
