import { createHash } from 'node:crypto';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const canonical = value => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])]))
    : value;
export const fingerprint = value => sha256(JSON.stringify(canonical(value)));
export const safeAge = (doc, cutoff) => {
  const value = doc.createdAt || doc._createdAt;
  const at = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(at) && at > 0 && at < cutoff;
};
export function isAuditCandidate(doc, cutoff) {
  return doc?._type === 'auditEvent' &&
    ['POS_MPESA_PAYMENT_STARTED','POS_MPESA_STK_SENT'].includes(doc.eventType) &&
    safeAge(doc,cutoff) && doc.resolutionStatus !== 'PENDING' &&
    typeof doc.entityId === 'string' && doc.entityId.startsWith('commerceOrder.');
}
export function isSaleCandidate(doc, cutoff) {
  return doc?._type === 'inventoryMovement' && doc.movementType === 'SALE' &&
    safeAge(doc,cutoff) && doc.correctedAt == null && doc.voidedAt == null &&
    typeof doc.productId === 'string' && doc.productId.length > 0 &&
    Number.isSafeInteger(doc.quantityChange) && doc.quantityChange < 0 &&
    typeof doc.order?._ref === 'string' && doc.order._ref.startsWith('commerceOrder.');
}
export function terminalOrder(order) {
  return order && order.paymentStatus === 'paid' &&
    Number(order.balanceDue) === 0 && order.inventoryReviewRequired !== true &&
    (order.status === 'delivered' || order.status === 'paid') &&
    Number(order.refundedAmount || 0) === 0;
}
export function exactArchive(doc, archived) {
  return archived && archived.sanity_id === doc._id &&
    archived.source_revision === doc._rev &&
    archived.document_json?._id === doc._id &&
    archived.document_json?._rev === doc._rev &&
    archived.document_json?._type === doc._type &&
    /^[a-f0-9]{64}$/.test(archived.source_sha256 || '') &&
    fingerprint(doc) === archived.source_sha256 &&
    fingerprint(archived.document_json) === archived.source_sha256;
}
