// DBK-44 pure, side-effect-free reconciliation logic.
import { createHash } from 'node:crypto';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
export function semanticHash(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
export function parseSourceRecords(ndjson) {
  const docs = [];
  const ids = new Set();
  const fingerprint = createHash('sha256');
  for (const raw of ndjson.split('\n')) {
    if (!raw.trim()) continue;
    const doc = JSON.parse(raw);
    if (!doc || doc._type !== 'inventoryMovement' || typeof doc._id !== 'string' || !doc._id.startsWith('inventoryMovement.') ||
        typeof doc._rev !== 'string' || typeof doc._createdAt !== 'string' || typeof doc._updatedAt !== 'string' ||
        !Number.isFinite(Date.parse(doc._updatedAt)) || !Number.isFinite(Date.parse(doc._createdAt))) {
      throw new Error('Unexpected/missing inventory movement metadata in source archive');
    }
    if (ids.has(doc._id)) throw new Error('Duplicate inventory movement ID in source archive');
    ids.add(doc._id);
    const encoded = JSON.stringify(doc);
    const encodedHash = sha256(encoded);
    fingerprint.update(doc._id + '\0' + doc._rev + '\0' + encodedHash + '\n');
    docs.push({sanity_id: doc._id, source_revision: doc._rev,
      source_created_at: doc._createdAt, source_updated_at: doc._updatedAt,
      source_sha256: encodedHash, document_json: doc});
  }
  if (!docs.length) throw new Error('No inventoryMovement records in source archive');
  return {rows: docs, fingerprint: fingerprint.digest('hex')};
}
export function planSync(source, archived) {
  const byId = new Map();
  for (const row of archived) {
    if (!row.sanity_id || byId.has(row.sanity_id)) throw new Error('Invalid/duplicate archive ID');
    byId.set(row.sanity_id, row);
  }
  const seen = new Set();
  const inserts = [];
  const updates = [];
  const counts = {sourceCount: source.length, archiveCount: archived.length,
    matchingIdRevisionAndBody: 0, toInsert: 0, toUpdate: 0,
    sourceOlderThanArchive: 0, sameTimestampDifferentRevision: 0,
    sameRevisionDifferentBody: 0, archiveIdsAbsentFromSnapshot: 0};
  for (const row of source) {
    if (seen.has(row.sanity_id)) throw new Error('Duplicate source ID');
    seen.add(row.sanity_id);
    const prior = byId.get(row.sanity_id);
    if (!prior) { inserts.push(row); counts.toInsert++; continue; }
    const sourceTime = Date.parse(row.source_updated_at);
    const archiveTime = Date.parse(prior.source_updated_at);
    if (row.source_revision === prior.source_revision) {
      if (semanticHash(row.document_json) === semanticHash(prior.document_json)) counts.matchingIdRevisionAndBody++;
      else counts.sameRevisionDifferentBody++;
    } else if (Number.isFinite(sourceTime) && (!Number.isFinite(archiveTime) || sourceTime > archiveTime)) {
      updates.push(row); counts.toUpdate++;
    } else if (Number.isFinite(archiveTime) && sourceTime < archiveTime) {
      counts.sourceOlderThanArchive++;
    } else {
      counts.sameTimestampDifferentRevision++;
    }
  }
  counts.archiveIdsAbsentFromSnapshot = archived.length - [...byId.keys()].filter(id => seen.has(id)).length;
  return {counts, inserts, updates, safeToApply: counts.sourceOlderThanArchive === 0 && counts.sameTimestampDifferentRevision === 0 && counts.sameRevisionDifferentBody === 0};
}
