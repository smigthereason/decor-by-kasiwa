/**
 * DBK-42: READ-ONLY inventoryMovement metadata inventory from live Sanity.
 * Run from repository root:
 * npx sanity exec scripts/dbk42_live_sanity_manifest.ts --with-user-token
 * Writes a local PRIVATE manifest. No document bodies, deletes or patches.
 */
import { getCliClient } from 'sanity/cli';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const client = getCliClient().withConfig({
  apiVersion: '2026-08-27',
  useCdn: false,
  perspective: 'raw',
});

type MovementMeta = { _id: string; _rev: string | null; _updatedAt: string | null };
const BATCH = 200;

async function main() {
  const { projectId, dataset } = client.config();
  if (projectId !== 'g34n810u' || dataset !== 'production') {
    throw new Error(`STOP: Wrong Sanity target: ${projectId}.${dataset}`);
  }
  const filter = '_type == "inventoryMovement" && !(_id in path("drafts.**"))';
  const before = await client.fetch<number>(`count(*[${filter}])`);
  const docs: MovementMeta[] = [];
  for (let offset = 0; offset < before; offset += BATCH) {
    const page = await client.fetch<MovementMeta[]>(
      `*[${filter}] | order(_id asc)[${offset}...${offset + BATCH}]{_id,_rev,_updatedAt}`
    );
    if (page.length === 0) throw new Error('STOP: Empty page before expected end');
    for (const doc of page) {
      if (!doc._id?.startsWith('inventoryMovement.') || typeof doc._rev !== 'string') {
        throw new Error('STOP: Unexpected document ID or revision in response');
      }
      docs.push(doc);
    }
  }
  const after = await client.fetch<number>(`count(*[${filter}])`);
  if (before !== after || docs.length !== before || new Set(docs.map(d => d._id)).size !== before) {
    throw new Error('STOP: Live dataset changed during scan or pagination was inconsistent; retry later');
  }
  const outputDir = path.join(os.homedir(), 'Downloads', 'DBK-sanity-private-backups');
  fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(outputDir, `DBK-42-live-inventory-manifest-${stamp}.json`);
  const result = {version: 1, projectId, dataset, capturedAt: new Date().toISOString(), count: docs.length, documents: docs};
  const body = JSON.stringify(result);
  fs.writeFileSync(outputPath, body, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({
    mode: 'READ ONLY - SANITY METADATA ONLY',
    liveInventoryMovements: docs.length,
    manifestSHA256: crypto.createHash('sha256').update(body).digest('hex'),
    manifestPath: outputPath,
    sanityMutations: 0,
    note: 'Manifest contains IDs and revisions. Keep it private. No permission to delete.'
  }, null, 2));
}
main().catch(err => {console.error('STOP:', err instanceof Error ? err.message : String(err)); process.exitCode = 1;});
