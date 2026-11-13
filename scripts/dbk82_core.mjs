import { createHash } from 'node:crypto';

export const PINNED_HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
export const CONFIRM = 'RETIRE_VERIFIED_ARCHIVED_AUDITS';
export const MIN_AGE_MS = 72 * 60 * 60 * 1000;
// DBK-49 pre-reviewed immutable/terminal audit categories. Do not retire unknown types.
export const ALLOWED_EVENTS = new Set(['POS_MPESA_PAYMENT_CONFIRMED','POS_MANUAL_PAYMENT_RECORDED',
  'POS_INVENTORY_RECONCILED','WORKFLOW_STAGE_COMPLETED','WORKFLOW_STAGE_ASSIGNED',
  'STAFF_LOGIN','STAFF_LOGOUT','EXPENSE_RECORDED']);

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const fingerprint = doc => createHash('sha256').update(JSON.stringify(canonical(doc))).digest('hex');
export function candidate(doc, live, now) {
  if (!doc || doc._type !== 'auditEvent' || !doc._id?.startsWith('auditEvent.') || !doc._rev) return 'invalid_snapshot';
  if (!live || doc._id !== live._id || doc._rev !== live._rev) return 'revision_mismatch_or_missing';
  if (!ALLOWED_EVENTS.has(doc.eventType)) return 'event_type_not_allowlisted';
  if (doc.resolutionStatus === 'PENDING' || live.resolutionStatus === 'PENDING') return 'pending_resolution';
  const created=Date.parse(doc._createdAt || ''), updated=Date.parse(doc._updatedAt || '');
  if (![created,updated].every(Number.isFinite)) return 'missing_timestamps';
  if (Math.max(created,updated) > now-MIN_AGE_MS) return 'recent_activity';
  return null;
}
export function verifiedArchive(snapshot, archive) {
  return Boolean(archive && archive.document_type === 'auditEvent' && archive.sanity_id === snapshot._id &&
    archive.source_revision === snapshot._rev && archive.source_sha256 === fingerprint(snapshot));
}
export function validateOptions({ mode, backupAgeMs, backupBytes, host, acknowledged, confirm, backupSha, actualSha }) {
  if (!['plan','archive','retire'].includes(mode)) throw Error('Unknown mode');
  if (!(backupAgeMs>=0 && backupAgeMs <= 2*60*60*1000) || backupBytes < 100_000) throw Error('Fresh verified production backup required (within 2h)');
  if (backupSha !== actualSha || !/^[a-f0-9]{64}$/.test(actualSha)) throw Error('Backup SHA256 mismatch');
  if (mode !== 'plan' && host !== PINNED_HOST) throw Error('Wrong Neon production host');
  if (mode === 'retire' && (!acknowledged || confirm !== CONFIRM)) throw Error('Reader verification and deletion acknowledgement required');
}
