// DBK-71: pure checks used by production stock seed command.
// No network, database, or file mutations in this module.
import { createHash } from 'node:crypto';

export const PINNED_PRODUCTION_HOST = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
export const PINNED_DATABASE = 'neondb';
export const PINNED_SANITY_PROJECT = 'g34n810u';
export const EXPECTED_QUARANTINED_UNITS = 475;

export const OPERATIONAL_TABLES = Object.freeze([
  'dbk51_stock_balances', 'dbk51_stock_operations', 'dbk54_stock_batches',
  'dbk55_paid_pos_settlements', 'dbk56_pos_orders', 'dbk56_pos_payments',
  'dbk57_manual_sales', 'dbk62_manual_sales', 'dbk63_pos_refunds',
  'dbk64_online_orders', 'dbk65_online_fulfilment', 'dbk68_daraja_orders',
  'dbk69_inventory_movements',
]);

export const GATE_TABLES = Object.freeze([
  'dbk51_stock_engine_config', 'dbk55_settlement_config', 'dbk56_ledger_config',
  'dbk57_manual_sale_config', 'dbk62_cutover_config', 'dbk63_financial_config',
  'dbk64_online_config', 'dbk65_online_fulfilment_config',
  'dbk68_daraja_config', 'dbk69_inventory_config',
]);

export function verifyDestination(environment) {
  const { DATABASE_URL, NEXT_PUBLIC_SANITY_PROJECT_ID, NEXT_PUBLIC_SANITY_DATASET,
    DBK71_EXPECTED_PRODUCTION_HOST } = environment;
  if (DBK71_EXPECTED_PRODUCTION_HOST !== PINNED_PRODUCTION_HOST)
    throw new Error('DBK71_EXPECTED_PRODUCTION_HOST must match the audited production host');
  if (!DATABASE_URL) throw new Error('Missing DATABASE_URL');
  const url = new URL(DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname.toLowerCase() !== PINNED_PRODUCTION_HOST ||
      decodeURIComponent(url.pathname.slice(1)) !== PINNED_DATABASE ||
      !url.username || !url.password)
    throw new Error('Production database identity mismatch: no query/write attempted');
  if (NEXT_PUBLIC_SANITY_PROJECT_ID !== PINNED_SANITY_PROJECT ||
      NEXT_PUBLIC_SANITY_DATASET !== 'production')
    throw new Error('Sanity project/dataset identity mismatch');
  return { databaseHost: url.hostname.toLowerCase(), database: PINNED_DATABASE,
    sanityProject: PINNED_SANITY_PROJECT, sanityDataset: 'production' };
}

export function validatePlan(plan) {
  if (!plan.safeToSeed || plan.problems.length || !plan.balanceCount ||
      plan.rows.length !== plan.balanceCount)
    throw new Error('Snapshot is unsafe or has inconsistent row count');
  if (plan.quantityClassification.quarantinedOnHand !== EXPECTED_QUARANTINED_UNITS)
    throw new Error(`Quarantine changed: expected ${EXPECTED_QUARANTINED_UNITS} units, found ${plan.quantityClassification.quarantinedOnHand}; investigate before seeding`);
  if (plan.quarantinedProducts.length !== 9)
    throw new Error('Quarantined-product count changed; investigate before seeding');
  if (plan.rows.some(r => r.product_revision === '' || r.inventory_revision === ''))
    throw new Error('Snapshot has missing source revisions');
  if (plan.rows.some(r => !Number.isSafeInteger(r.on_hand) || !Number.isSafeInteger(r.incoming)))
    throw new Error('Snapshot has unsafe numeric quantities');
  if (!/^[0-9a-f]{64}$/.test(plan.fingerprint)) throw new Error('Invalid stock fingerprint');
  return true;
}

export function checkEmptyDatabaseState({ tables, gates, seedFingerprint }) {
  const missing = OPERATIONAL_TABLES.filter(name => !(name in tables));
  if (missing.length) throw new Error(`Operational counts missing: ${missing.join(', ')}`);
  const nonempty = OPERATIONAL_TABLES.filter(name => BigInt(tables[name]) !== 0n);
  if (nonempty.length) throw new Error(`Production operational data already exists: ${nonempty.join(', ')}`);
  const absentGates = GATE_TABLES.filter(name => !(name in gates));
  if (absentGates.length) throw new Error(`Missing gate config rows: ${absentGates.join(', ')}`);
  const activeGates = GATE_TABLES.filter(name => gates[name] !== false);
  if (activeGates.length) throw new Error(`Production gate is active or invalid: ${activeGates.join(', ')}`);
  if (seedFingerprint !== null && seedFingerprint !== undefined)
    throw new Error('Production already seeded; no overwrite permitted');
  return true;
}

function keyOf(r) { return JSON.stringify([r.product_id, r.variant_id, r.location_id]); }
function normalizedRow(r) {
  return {
    product_id: String(r.product_id), variant_id: String(r.variant_id), location_id: String(r.location_id),
    on_hand: BigInt(r.on_hand).toString(), incoming: BigInt(r.incoming).toString(),
    product_revision: String(r.product_revision), inventory_revision: String(r.inventory_revision),
  };
}

export function verifyPersistedRows(plan, databaseRows, configuredFingerprint, writesEnabled) {
  if (configuredFingerprint !== plan.fingerprint) throw new Error('Stored seed fingerprint differs from plan');
  if (writesEnabled !== false) throw new Error('Stock write gate unexpectedly enabled');
  if (databaseRows.length !== plan.rows.length) throw new Error('Persisted row count mismatch');
  const expected = new Map(plan.rows.map(r => [keyOf(r), normalizedRow(r)]));
  const actual = new Map();
  for (const row of databaseRows) {
    if (row.seed_fingerprint !== plan.fingerprint) throw new Error('Row fingerprint mismatch');
    const key = keyOf(row);
    if (actual.has(key)) throw new Error('Duplicate stored stock key');
    actual.set(key, normalizedRow(row));
  }
  for (const [key, value] of expected) {
    const got = actual.get(key);
    if (!got || JSON.stringify(got) !== JSON.stringify(value))
      throw new Error(`Persisted stock differs from snapshot for ${key}`);
  }
  let onHand = 0n, incoming = 0n, quarantined = 0n;
  for (const row of databaseRows) {
    onHand += BigInt(row.on_hand); incoming += BigInt(row.incoming);
    if (row.variant_id === '__UNALLOCATED_VARIANT__') quarantined += BigInt(row.on_hand);
  }
  if (onHand !== BigInt(plan.quantityTotals.onHand) || incoming !== BigInt(plan.quantityTotals.incoming) ||
      quarantined !== BigInt(EXPECTED_QUARANTINED_UNITS))
    throw new Error('Persisted total or quarantine mismatch');
  return { rows: databaseRows.length, onHand: onHand.toString(), incoming: incoming.toString(),
    quarantined: quarantined.toString(), fingerprint: configuredFingerprint, writesEnabled: false };
}

export function sha256(input) { return createHash('sha256').update(input).digest('hex'); }

export function parseArguments(argv) {
  if (argv.length < 1) throw new Error('Expected Sanity export filename');
  const [archive, ...flags] = argv;
  const apply = flags.includes('--apply');
  const allowed = ['--review', '--apply'];
  const fields = {};
  for (const flag of flags) {
    if (allowed.includes(flag)) continue;
    const m = /^--(confirm-fingerprint|confirm-archive-sha256|confirm-freeze)=(.*)$/.exec(flag);
    if (!m || Object.hasOwn(fields, m[1])) throw new Error(`Unexpected/duplicate argument: ${flag}`);
    fields[m[1]] = m[2];
  }
  if (flags.includes('--review') && apply) throw new Error('Choose either review or apply');
  if (!apply && Object.keys(fields).length) throw new Error('Confirmations only valid with --apply');
  return { archive, apply, fields };
}

export function validateApplyApproval({ fields, plan, archiveSha256, env }) {
  if (env.DBK71_ALLOW_PRODUCTION_SEED !== 'YES') throw new Error('DBK71_ALLOW_PRODUCTION_SEED=YES required');
  if (fields['confirm-freeze'] !== 'STOCK_WRITES_FROZEN') throw new Error('Operator must confirm stock/payment write freeze');
  if (fields['confirm-fingerprint'] !== plan.fingerprint) throw new Error('Snapshot fingerprint confirmation mismatch');
  if (fields['confirm-archive-sha256'] !== archiveSha256) throw new Error('Sanity archive SHA-256 confirmation mismatch');
  return true;
}
