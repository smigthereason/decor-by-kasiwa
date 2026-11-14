/** DBK-76: pure read-only cutover checks; this module NEVER approves or enables writes. */
export const EXPECTED_STOCK = Object.freeze({
  rows: 1083,
  onHand: '541084',
  incoming: '91279',
  fingerprint: 'c6de0592e7aeec8aadb1fb54e8bbb68b5bef936b43dbd8bc76558f0b1b3a8710',
});

export const REQUIRED_GATES = Object.freeze([
  'stock_engine', 'settlement', 'pos_ledger', 'manual_pos', 'real_pos', 'finance',
  'online_paystack', 'online_fulfilment', 'daraja_mpesa', 'inventory_admin',
]);
/** Convert raw snake_case SQL aggregates into the assessment's canonical shape. */
export function normalizeDBK76StockRow(row) {
  return {
    rows: Number(row?.rows),
    onHand: row?.on_hand == null ? '' : String(row.on_hand),
    incoming: row?.incoming == null ? '' : String(row.incoming),
    fingerprint: typeof row?.fingerprint === 'string' ? row.fingerprint : null,
  };
}

export const READINESS_FIELDS = Object.freeze([
  'sanity_stock_frozen', 'all_stock_writers_switched', 'provider_callbacks_ready',
  'receivables_ready', 'refunds_ready', 'reports_ready',
]);

export function assessDBK76(s) {
  const blockers = [];
  const notes = [];
  if (s.identity !== 'production-neondb') blockers.push('Production database identity was not verified');
  if (s.freezeActive !== true) blockers.push('Maintenance freeze is not active');
  // An audited DBK-90 reconciliation supersedes the one-time DBK-71 seed.
  // This is evidence of Neon state matching a logged snapshot, NOT proof
  // of current Sanity parity after commerce has resumed.
  const hasDBK101 = s.dbk101 !== undefined && s.dbk101 !== null;
  const hasDBK90 = s.dbk90 !== undefined && s.dbk90 !== null;
  const stockMatches = hasDBK101
    ? s.dbk101.rowsMatch === true &&
      typeof s.dbk101.recordedAt === 'string' &&
      Number.isFinite(Date.parse(s.dbk101.recordedAt)) &&
      /^[a-f0-9]{64}$/.test(s.dbk101.nextFingerprint || '') &&
      s.stock?.fingerprint === s.dbk101.nextFingerprint
    : hasDBK90
    ? s.dbk90.rowsMatch === true &&
      typeof s.dbk90.reconciledAt === 'string' &&
      Number.isFinite(Date.parse(s.dbk90.reconciledAt)) &&
      /^[a-f0-9]{64}$/.test(s.dbk90.nextFingerprint || '') &&
      s.stock?.fingerprint === s.dbk90.nextFingerprint
    : s.stock?.rows === EXPECTED_STOCK.rows &&
      String(s.stock?.onHand) === EXPECTED_STOCK.onHand &&
      String(s.stock?.incoming) === EXPECTED_STOCK.incoming &&
      s.stock?.fingerprint === EXPECTED_STOCK.fingerprint;
  if (!stockMatches) {
    blockers.push('Neon inventory does not match an audited DBK-90 reconciliation or the verified DBK-71 seed');
  }
  if (!s.legacyReceivables || !Number.isSafeInteger(s.legacyReceivables.count) ||
      !Number.isFinite(s.legacyReceivables.amountKES)) {
    blockers.push('Live Sanity legacy receivables have not been counted');
  } else if ((s.legacyReceivables.count > 0 || s.legacyReceivables.amountKES > 0) && s.dbk107Ready !== true) {
    blockers.push(`Legacy Sanity receivables remain (${s.legacyReceivables.count} orders; KES ${s.legacyReceivables.amountKES}). Approved Neon historical-finance bridge not verified`);
  }
  if (!Number.isSafeInteger(s.pendingCallbacks) || s.pendingCallbacks !== 0) blockers.push('Queued callbacks remain unreconciled');
  if (!Number.isSafeInteger(s.paidUncommittedMpesa) || s.paidUncommittedMpesa !== 0) blockers.push('Paid M-Pesa stock exceptions remain');
  if (!Number.isSafeInteger(s.paidUncommittedOnline) || s.paidUncommittedOnline !== 0) blockers.push('Paid Paystack stock exceptions remain');
  if (!Number.isSafeInteger(s.manualHistory) || s.manualHistory > 500 || s.manualHistory < 0) {
    blockers.push('Manual POS history exceeds current 500-record read cap');
  }
  if (!Number.isSafeInteger(s.mpesaHistory) || s.mpesaHistory > 500 || s.mpesaHistory < 0) {
    blockers.push('M-Pesa history exceeds current 500-record read cap');
  }
  if (!Array.isArray(s.gates) || s.gates.length !== REQUIRED_GATES.length ||
      REQUIRED_GATES.some(name => !s.gates.some(g => g.name === name && typeof g.enabled === 'boolean'))) {
    blockers.push('Not all ten database gates could be read');
  } else {
    const enabled = s.gates.filter(g => g.enabled === true).map(g => g.name);
    if (enabled.length) blockers.push(`Transaction gates already enabled during pre-cutover audit: ${enabled.join(', ')}`);
  }
  if (!s.dbk62 || READINESS_FIELDS.some(field => typeof s.dbk62[field] !== 'boolean')) {
    blockers.push('DBK-62 readiness record is missing or incomplete');
  } else {
    const incomplete = READINESS_FIELDS.filter(field => s.dbk62[field] !== true);
    if (incomplete.length) blockers.push(`DBK-62 still unapproved: ${incomplete.join(', ')}`);
    if (!stockMatches || s.dbk62.reconciliation_fingerprint !== s.stock?.fingerprint) blockers.push('DBK-62 reconciliation fingerprint not signed off');
  }
  // External business/ops evidence is not in the database; never turn this into a GO decision.
  notes.push('DBK-101 rebaseline and DBK-90 logs are historical snapshots; revalidate current Sanity stock under an actual write freeze before authority transfer.');
  notes.push('Historical debt requires an independently verified DBK107 Neon finance bridge; source Sanity order balances are never silently discarded.');
  notes.push('Code inspection: legacy Sanity refund POST is blocked after DBK62_POS_BACKEND=neon.');
  notes.push('DBK-74 cannot stop independent direct Sanity Studio/API integrations.');
  notes.push('Provider payment ledgers, legacy receivables/refunds and deployed env switches require human verification.');
  return {stage:'DBK-76',mode:'READ_ONLY_PRE_CUTOVER_AUDIT',status:'HOLD',
    stockSeedMatches: stockMatches, stockReconciliationMatches: stockMatches,
    databaseChecksPassed: blockers.length === 0,
    blockers,notes,
    warning:'No DB writes or app activation performed. Database checks alone cannot authorize go-live.'};
}
