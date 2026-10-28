#!/usr/bin/env node
// DBK-42: read-only comparison of Sanity inventoryMovement IDs/revisions with Neon archive.
// No inserts, updates, or deletes. Prints aggregates only (not IDs, customer data or credentials).
import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const manifestPath = process.argv[2];
if (!manifestPath || process.argv.length !== 3) {
  console.error('Usage: node --env-file=.env.local scripts/dbk42_compare_neon.mjs /private/DBK-42-live-inventory-manifest-*.json');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('STOP: DATABASE_URL missing');
  process.exit(2);
}
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.projectId !== 'g34n810u' || manifest.dataset !== 'production' || !Array.isArray(manifest.documents) || manifest.count !== manifest.documents.length) {
    throw new Error('Invalid or unexpected Sanity manifest');
  }
  const sql = neon(process.env.DATABASE_URL);
  const archive = await sql`SELECT sanity_id, source_revision FROM dbk_inventory_movement_archive ORDER BY sanity_id ASC`;
  const liveMap = new Map(manifest.documents.map(d => [d._id, d._rev]));
  const archiveMap = new Map(archive.map(d => [d.sanity_id, d.source_revision]));
  if (liveMap.size !== manifest.documents.length || archiveMap.size !== archive.length) {
    throw new Error('Duplicate source IDs; stop and investigate');
  }
  let newInSanity = 0;
  let changedRevision = 0;
  let matchingRevision = 0;
  let noLongerInSanity = 0;
  for (const [id, revision] of liveMap) {
    if (!archiveMap.has(id)) newInSanity++;
    else if (archiveMap.get(id) !== revision) changedRevision++;
    else matchingRevision++;
  }
  for (const id of archiveMap.keys()) if (!liveMap.has(id)) noLongerInSanity++;
  console.log(JSON.stringify({
    mode: 'READ ONLY - NO DATABASE WRITES',
    sanityManifestCapturedAt: manifest.capturedAt,
    liveSanityMovements: liveMap.size,
    neonArchivedMovements: archiveMap.size,
    matchingIdAndRevision: matchingRevision,
    newInSanityMissingFromNeon: newInSanity,
    revisionsChangedSinceArchive: changedRevision,
    archiveIDsNoLongerInSanity: noLongerInSanity,
    inSyncAtManifestTime: newInSanity === 0 && changedRevision === 0 && noLongerInSanity === 0,
    status: 'ARCHIVE CHECK ONLY; NOT A PRODUCTION CUTOVER OR DELETION APPROVAL'
  }, null, 2));
} catch (err) {
  console.error('STOP:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
