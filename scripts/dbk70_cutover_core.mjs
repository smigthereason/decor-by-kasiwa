// Pure DBK-70 stock snapshot / live-document comparison helpers.
// No DB clients, network requests or write operations in this module.
import { createHash } from 'node:crypto';

const VALID_TYPES = new Set(['product', 'inventoryRecord']);
export const EXPECTED_TABLES = Object.freeze([
  'dbk51_stock_engine_config', 'dbk51_stock_balances', 'dbk51_stock_operations',
  'dbk54_stock_batches', 'dbk55_settlement_config', 'dbk55_paid_pos_settlements',
  'dbk56_ledger_config', 'dbk56_pos_orders', 'dbk56_pos_payments', 'dbk57_manual_sale_config', 'dbk57_manual_sales',
  'dbk62_cutover_config', 'dbk62_manual_sales', 'dbk63_financial_config', 'dbk63_pos_refunds',
  'dbk64_online_config', 'dbk64_online_orders',
  'dbk65_online_fulfilment', 'dbk65_online_fulfilment_config', 'dbk68_daraja_config',
  'dbk68_daraja_orders', 'dbk69_inventory_config',
  'dbk69_inventory_movements',
]);

export function revisionMap(documents) {
  if (!Array.isArray(documents)) throw new Error('Documents must be an array');
  const result = new Map();
  for (const doc of documents) {
    if (!VALID_TYPES.has(doc?._type) || typeof doc?._id !== 'string' || doc._id.startsWith('drafts.')) continue;
    if (typeof doc._rev !== 'string' || !doc._rev) throw new Error(`Document ${doc._id} has no revision`);
    if (result.has(doc._id)) throw new Error(`Duplicate document ${doc._id}`);
    result.set(doc._id, { revision: doc._rev, type: doc._type });
  }
  return result;
}

export function compareRevisions(snapshotDocs, liveDocs) {
  const expected = revisionMap(snapshotDocs);
  const current = revisionMap(liveDocs);
  const changed = [], missing = [], added = [];
  for (const [id, doc] of expected) {
    const actual = current.get(id);
    if (!actual) missing.push(id);
    else if (actual.revision !== doc.revision || actual.type !== doc.type) changed.push(id);
  }
  for (const id of current.keys()) if (!expected.has(id)) added.push(id);
  return {
    snapshotDocuments: expected.size, liveDocuments: current.size,
    changedCount: changed.length, missingCount: missing.length, addedCount: added.length,
    changedSample: changed.slice(0, 10), missingSample: missing.slice(0, 10), addedSample: added.slice(0, 10),
    exactMatch: changed.length === 0 && missing.length === 0 && added.length === 0,
  };
}

export function validateProductionHost(connectionString, expectedHost) {
  if (!connectionString || !expectedHost) throw new Error('Missing production database URL or expected hostname');
  const host = new URL(connectionString).hostname.toLowerCase();
  const expected = expectedHost.toLowerCase().trim();
  if (!host || !expected || host !== expected || /(?:^|-)test(?:-|\.)/.test(host)) {
    throw new Error('Host mismatch: refusing to read an unapproved database');
  }
  return host;
}

export function classifyPreflight({ revisions, plan, neon }) {
  const reasons = [];
  if (!plan.safeToSeed) reasons.push('Snapshot validation reported problems');
  if (!revisions.exactMatch) reasons.push('Sanity products or inventory changed after export');
  if (neon.missingTables.length) reasons.push('Production Neon is missing required DBK schemas');
  if (neon.seedFingerprint) reasons.push('Production stock ledger already has a seed; do not overwrite');
  if (neon.balanceRows > 0 || neon.stockOperations > 0) reasons.push('Production stock ledger is not empty');
  if (neon.activeGates.length) reasons.push('One or more Neon production write gates are enabled');
  return { eligibleForFrozenStockSeedReview: reasons.length === 0, blockers: reasons,
    note: 'This is only a read-only point-in-time check; eligibility is NOT permission to seed or switch payment/inventory traffic.' };
}

export function sha256Bytes(input) { return createHash('sha256').update(input).digest('hex'); }
