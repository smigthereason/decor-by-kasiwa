#!/usr/bin/env node
/**
 * DBK-44: Safe, opt-in sync of an offline Sanity export to the Neon ARCHIVE ONLY.
 * DEFAULT: read-only compare. Apply requires --apply --confirm-sha256=DRY_RUN_FINGERPRINT.
 * Never writes to Sanity. Never deletes. Never changes stock balances, payments, or readers.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planSync, parseSourceRecords } from './dbk44_inventory_core.mjs';

const args = process.argv.slice(2);
const archivePath = args[0];
const extra = args.slice(1);
const apply = extra.includes('--apply');
const confirmation = extra.find(x => x.startsWith('--confirm-sha256='))?.split('=')[1];
const expectedUsage = 'Usage: node --env-file=.env.local scripts/dbk44_sync_inventory_snapshot.mjs /private/path/production.tar.gz [--apply --confirm-sha256=<DRY_RUN_SHA256>]';
if (!archivePath || !fs.existsSync(archivePath) || extra.some(x => x !== '--apply' && !x.startsWith('--confirm-sha256=')) ||
    (!apply && confirmation) || (apply && !/^[a-f0-9]{64}$/.test(confirmation || '')) || extra.filter(x => x === '--apply').length > 1 || extra.filter(x => x.startsWith('--confirm-sha256=')).length > 1) {
  console.error('STOP: invalid usage. ' + expectedUsage);
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('STOP: DATABASE_URL missing');
  process.exit(2);
}
const extractor = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dbk41_extract_inventory.py');
if (!fs.existsSync(extractor)) {
  console.error('STOP: dbk41_extract_inventory.py must be in scripts/');
  process.exit(2);
}

try {
  // Validate the complete export and all source records BEFORE making any database write.
  const extraction = spawnSync('python3', [extractor, archivePath], {
    encoding: 'utf8', maxBuffer: 100 * 1024 * 1024, timeout: 90_000,
  });
  if (extraction.error || extraction.status !== 0 || !extraction.stdout) {
    throw new Error('Source extraction failed; no database writes performed');
  }
  const {rows: source, fingerprint} = parseSourceRecords(extraction.stdout);
  if (apply && fingerprint !== confirmation) {
    throw new Error('Snapshot SHA-256 differs from dry-run confirmation; no database writes performed');
  }
  const {neon} = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  const [{name, table_name, database_bytes}] = await sql`
    SELECT current_database() AS name,
      to_regclass('public.dbk_inventory_movement_archive')::text AS table_name,
      pg_database_size(current_database())::bigint AS database_bytes`;
  if (name !== 'neondb' || table_name !== 'dbk_inventory_movement_archive') {
    throw new Error('Wrong Neon database or missing DBK-41 archive table');
  }
  if (Number(database_bytes) >= 800 * 1024 * 1024) {
    throw new Error('Neon database size at/above 800 MiB safety threshold');
  }
  const readArchive = () => sql`SELECT sanity_id, source_revision, source_updated_at, document_json
    FROM dbk_inventory_movement_archive ORDER BY sanity_id`;
  const existing = await readArchive();
  const plan = planSync(source, existing);
  console.log(JSON.stringify({
    stage: 'DBK-44', mode: apply ? 'ARCHIVE-ONLY APPLY REQUESTED' : 'READ ONLY DRY RUN',
    snapshotSha256: fingerprint,
    ...plan.counts, safeToApply: plan.safeToApply,
    sanityWrites: 0, stockBalanceWrites: 0, deletionPermission: false,
    warning: 'This snapshot is NOT a live cutover and may already be stale while staff enter stock.'
  }, null, 2));
  if (!apply) process.exit(0);
  if (!plan.safeToApply) throw new Error('Source/archive conflicts detected; apply blocked');
  const actions = [...plan.inserts, ...plan.updates];
  let affected = 0;
  for (let start = 0; start < actions.length; start += 50) {
    const payload = JSON.stringify(actions.slice(start, start + 50));
    const result = await sql`
      INSERT INTO dbk_inventory_movement_archive
        (sanity_id, source_revision, source_created_at, source_updated_at, source_sha256, document_json)
      SELECT r.sanity_id, r.source_revision, r.source_created_at, r.source_updated_at, r.source_sha256, r.document_json
      FROM jsonb_to_recordset(${payload}::jsonb) AS r(
        sanity_id text, source_revision text, source_created_at timestamptz,
        source_updated_at timestamptz, source_sha256 text, document_json jsonb
      )
      ON CONFLICT (sanity_id) DO UPDATE SET
        source_revision = EXCLUDED.source_revision,
        source_created_at = EXCLUDED.source_created_at,
        source_updated_at = EXCLUDED.source_updated_at,
        source_sha256 = EXCLUDED.source_sha256,
        document_json = EXCLUDED.document_json,
        staged_at = now()
      WHERE dbk_inventory_movement_archive.source_updated_at IS NULL OR
        EXCLUDED.source_updated_at > dbk_inventory_movement_archive.source_updated_at
      RETURNING sanity_id`;
    affected += result.length;
  }
  const finalArchive = await readArchive();
  const finalPlan = planSync(source, finalArchive);
  console.log(JSON.stringify({
    stage: 'DBK-44', mode: 'ARCHIVE-ONLY SYNC COMPLETE',
    insertedOrUpdatedRows: affected, neonArchiveCount: finalArchive.length,
    remainingMissing: finalPlan.counts.toInsert, remainingOutdated: finalPlan.counts.toUpdate,
    remainingConflicts: finalPlan.counts.sourceOlderThanArchive + finalPlan.counts.sameTimestampDifferentRevision + finalPlan.counts.sameRevisionDifferentBody,
    archivedIdsNotInThisSnapshot: finalPlan.counts.archiveIdsAbsentFromSnapshot,
    sanityWrites: 0, stockBalanceWrites: 0, deletionPermission: false,
  }, null, 2));
  if (finalPlan.counts.toInsert || finalPlan.counts.toUpdate || !finalPlan.safeToApply) {
    throw new Error('Post-sync verification incomplete; no deletion/cutover permitted');
  }
} catch (error) {
  // Never print raw data, private identifiers, tokens, or connection strings.
  console.error('STOP:', error instanceof Error ? error.message : 'DBK-44 failed');
  process.exitCode = 1;
}
