import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const get = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('independent audit writer is opt-in and never falls back to Sanity', () => {
  const writer = get('lib/db/audit-write-neon.ts');
  assert.match(writer, /DBK_AUDIT_WRITE_BACKEND === "neon"/);
  assert.match(writer, /DBK_AUDIT_ARCHIVE_READ !== "1"/);
  assert.match(writer, /ON CONFLICT \(id\) DO NOTHING/);
  assert.match(writer, /payload_hash !== payloadHash/);
  assert.doesNotMatch(writer, /serverClient|\.createIfNotExists\(/);
});
test('existing atomic Sanity stock and order ledger function is not modified', () => {
  const ledger = get('lib/pos/ledger.ts');
  assert.match(ledger, /export function addInventoryMovementsToTransaction/);
  assert.match(ledger, /transaction\.createIfNotExists\(/);
  assert.match(ledger, /if \(neonAuditWritesEnabled\(\)\)/);
});
test('archive reader merges Neon live writes with DBK-46 historical archive', () => {
  const reader = get('lib/db/audit-archive-neon.ts');
  assert.match(reader, /FROM public\.dbk_live_audit_events/);
  assert.match(reader, /FROM public\.dbk_sanity_operational_archive/);
  assert.match(reader, /mergeUniqueById\(snapshots,/);
});
test('SQL is create-only and not destructive', () => {
  const schema = get('migration/dbk48/audit-live-neon.sql');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS/);
  assert.doesNotMatch(schema, /\b(?:DELETE\s+FROM|DROP\s+TABLE|TRUNCATE|ALTER\s+TABLE\s+.*DROP)\b/i);
});
