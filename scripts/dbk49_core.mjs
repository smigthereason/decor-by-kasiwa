import { createHash } from 'node:crypto';

export const ALLOWED_EVENTS = Object.freeze([
  'POS_MPESA_PAYMENT_CONFIRMED',
  'POS_MANUAL_PAYMENT_RECORDED',
  'POS_INVENTORY_RECONCILED',
  'WORKFLOW_STAGE_COMPLETED',
  'WORKFLOW_STAGE_ASSIGNED',
  'STAFF_LOGIN',
  'STAFF_LOGOUT',
  'EXPENSE_RECORDED',
]);
const allowed = new Set(ALLOWED_EVENTS);

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  }
  return value;
}
export function digest(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(canonical(value))).digest('hex');
}
export function checkCandidate(archive, live, cutoff) {
  if (!archive || archive.document_type !== 'auditEvent') return 'wrong_archive_type';
  const d = archive.document_json;
  if (!d || d._type !== 'auditEvent' || !allowed.has(d.eventType)) return 'event_type_not_allowed';
  if (!live || live._id !== archive.sanity_id || live._type !== 'auditEvent') return 'not_live_or_id_mismatch';
  if (!live._rev || live._rev !== archive.source_revision) return 'revision_mismatch';
  if (digest(live) !== archive.source_sha256) return 'body_mismatch';
  if (!Number.isFinite(Date.parse(live._createdAt || '')) || Date.parse(live._createdAt) >= cutoff) return 'too_recent';
  if (!Number.isFinite(Date.parse(live._updatedAt || '')) || Date.parse(live._updatedAt) >= cutoff) return 'recent_update';
  if (live.resolutionStatus === 'PENDING') return 'open_resolution';
  return null;
}
