#!/usr/bin/env node
// DBK-71: one-time, operator-approved frozen production stock seed.
// Review defaults to read-only. Apply requires independent freeze and explicit confirmations.
// Does NOT alter application flags, process payments, or enable any Neon write gates.
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { buildStockSnapshot } from './dbk51_stock_core.mjs';
import { compareRevisions, EXPECTED_TABLES } from './dbk70_cutover_core.mjs';
import { verifyDestination, validatePlan, checkEmptyDatabaseState,
  verifyPersistedRows, parseArguments, validateApplyApproval, OPERATIONAL_TABLES,
  GATE_TABLES } from './dbk71_production_seed_core.mjs';

const usage = 'Usage: node scripts/dbk71_production_seed.mjs <fresh-frozen-export.tar.gz> [--review | --apply --confirm-fingerprint=... --confirm-archive-sha256=... --confirm-freeze=STOCK_WRITES_FROZEN]';
let options;
try { options = parseArguments(process.argv.slice(2)); }
catch (error) { console.error(error.message, '\n' + usage); process.exit(2); }
const { archive, apply, fields } = options;
if (!existsSync(archive)) throw new Error('Sanity archive missing: ' + archive);
const identity = verifyDestination(process.env);
const entries = execFileSync('tar', ['-tzf', archive], { encoding:'utf8', maxBuffer:16*1024*1024 })
  .split('\n').filter(Boolean);
const matches = entries.filter(s => s === 'data.ndjson' || s.endsWith('/data.ndjson'));
if (matches.length !== 1) throw new Error('Archive must have exactly one data.ndjson');
const data = execFileSync('tar', ['-xOzf', archive, matches[0]], { encoding:'utf8', maxBuffer:512*1024*1024 });
const documents = [];
for (const [index, line] of data.split('\n').entries()) {
  if (!line.trim()) continue;
  let doc;
  try { doc = JSON.parse(line); }
  catch { throw new Error(`Bad JSON in export line ${index+1}`); }
  if (doc._type === 'product' || doc._type === 'inventoryRecord') documents.push(doc);
}
const plan = buildStockSnapshot(documents);
validatePlan(plan);
const sha = createHash('sha256');
for await (const chunk of createReadStream(archive)) sha.update(chunk);
const archiveSha256 = sha.digest('hex');
// Fail fast on approval mismatch BEFORE any database or Sanity calls.
if (apply) validateApplyApproval({ fields, plan, archiveSha256, env: process.env });

const { createClient } = await import('@sanity/client');
const token = process.env.SANITY_API_READ_TOKEN || process.env.SANITY_API_WRITE_TOKEN;
if (!token) throw new Error('Sanity API token required for uncached revision validation');
const sanity = createClient({projectId:identity.sanityProject, dataset:identity.sanityDataset,
  apiVersion:'2026-08-27', useCdn:false, token:token.replace(/^['"]|['"]$/g,''), perspective:'published'});
async function checkSanityRevisions() {
  const live = await sanity.fetch('*[_type in ["product","inventoryRecord"] && !(_id in path("drafts.**"))]{_id,_type,_rev}',
    {}, {cache:'no-store'});
  const result = compareRevisions(documents, live);
  if (!result.exactMatch) throw new Error(`Sanity revisions differ from export: ${JSON.stringify(result)}`);
  return result;
}

const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
async function checkDatabaseEmpty() {
  // Do not query named tables until all required schema objects have been checked.
  const schema = await sql`SELECT name, to_regclass('public.' || name)::text AS relation
    FROM unnest(string_to_array(${EXPECTED_TABLES.join(',')}, ',')) AS name ORDER BY name`;
  const missing = schema.filter(row=>!row.relation).map(row=>row.name);
  if (missing.length) throw new Error(`Missing production schema objects: ${missing.join(', ')}`);
  const functionState = await sql`SELECT current_database() AS database,
    to_regprocedure('public.dbk51_seed_stock(text,jsonb,integer)')::text AS seed_function`;
  if (functionState[0]?.database !== 'neondb' || !functionState[0]?.seed_function)
    throw new Error('Wrong database or production seed function not installed');
  const functionPermission = await sql`SELECT has_function_privilege(current_user,
    'public.dbk51_seed_stock(text,jsonb,integer)', 'EXECUTE') AS can_execute`;
  if (functionPermission[0]?.can_execute !== true)
    throw new Error('Current Neon DB role cannot execute the audited seed function');
  const gates = await sql`
    SELECT 'dbk51_stock_engine_config' AS name, writes_enabled AS enabled FROM public.dbk51_stock_engine_config WHERE singleton
    UNION ALL SELECT 'dbk55_settlement_config',enabled FROM public.dbk55_settlement_config WHERE singleton
    UNION ALL SELECT 'dbk56_ledger_config',enabled FROM public.dbk56_ledger_config WHERE singleton
    UNION ALL SELECT 'dbk57_manual_sale_config',enabled FROM public.dbk57_manual_sale_config WHERE singleton
    UNION ALL SELECT 'dbk62_cutover_config',enabled FROM public.dbk62_cutover_config WHERE singleton
    UNION ALL SELECT 'dbk63_financial_config',enabled FROM public.dbk63_financial_config WHERE singleton
    UNION ALL SELECT 'dbk64_online_config',enabled FROM public.dbk64_online_config WHERE singleton
    UNION ALL SELECT 'dbk65_online_fulfilment_config',enabled FROM public.dbk65_online_fulfilment_config WHERE singleton
    UNION ALL SELECT 'dbk68_daraja_config',enabled FROM public.dbk68_daraja_config WHERE singleton
    UNION ALL SELECT 'dbk69_inventory_config',enabled FROM public.dbk69_inventory_config WHERE singleton`;
  const gateValues = Object.fromEntries(gates.map(r => [r.name, r.enabled]));
  const fingerprints = await sql`SELECT seed_fingerprint FROM public.dbk51_stock_engine_config WHERE singleton`;
  if (fingerprints.length !== 1 || gates.length !== GATE_TABLES.length)
    throw new Error('Missing or inconsistent singleton gate records');
  const counts = await sql`SELECT
    (SELECT count(*) FROM public.dbk51_stock_balances)::text AS dbk51_stock_balances,
    (SELECT count(*) FROM public.dbk51_stock_operations)::text AS dbk51_stock_operations,
    (SELECT count(*) FROM public.dbk54_stock_batches)::text AS dbk54_stock_batches,
    (SELECT count(*) FROM public.dbk55_paid_pos_settlements)::text AS dbk55_paid_pos_settlements,
    (SELECT count(*) FROM public.dbk56_pos_orders)::text AS dbk56_pos_orders,
    (SELECT count(*) FROM public.dbk56_pos_payments)::text AS dbk56_pos_payments,
    (SELECT count(*) FROM public.dbk57_manual_sales)::text AS dbk57_manual_sales,
    (SELECT count(*) FROM public.dbk62_manual_sales)::text AS dbk62_manual_sales,
    (SELECT count(*) FROM public.dbk63_pos_refunds)::text AS dbk63_pos_refunds,
    (SELECT count(*) FROM public.dbk64_online_orders)::text AS dbk64_online_orders,
    (SELECT count(*) FROM public.dbk65_online_fulfilment)::text AS dbk65_online_fulfilment,
    (SELECT count(*) FROM public.dbk68_daraja_orders)::text AS dbk68_daraja_orders,
    (SELECT count(*) FROM public.dbk69_inventory_movements)::text AS dbk69_inventory_movements`;
  if (counts.length !== 1) throw new Error('Missing operational count summary');
  checkEmptyDatabaseState({tables:counts[0], gates:gateValues, seedFingerprint:fingerprints[0].seed_fingerprint});
  return { gateValues, counts: counts[0] };
}

// Prevent the script from accidentally returning a review approval after source changed.
const revisions = await checkSanityRevisions();
const emptyState = await checkDatabaseEmpty();
const baseReport = {
  stage:'DBK-71', mode:apply?'PRODUCTION_SEED_APPLY':'PRODUCTION_SEED_REVIEW_ONLY',
  sanityArchive:basename(archive), archiveSha256, identity,
  source:{ products:plan.productCount, inventoryRecords:plan.inventoryRecordCount,
    stockRows:plan.balanceCount, onHand:plan.quantityTotals.onHand,
    incoming:plan.quantityTotals.incoming, quarantined:plan.quantityClassification.quarantinedOnHand,
    fingerprint:plan.fingerprint }, sanityRevisions:revisions,
  database:{ operationalTablesChecked: OPERATIONAL_TABLES.length, gatesDisabled: GATE_TABLES.length },
};
if (!apply) {
  console.log(JSON.stringify({...baseReport, eligibleForFrozenSeedReview:true,
    warning:'Point-in-time check only; freeze Sanity inventory/order/payment writes and take a fresh export before apply. NO database writes were made.'},null,2));
  process.exit(0);
}

// A human-controlled write freeze is essential: Sanity cannot be locked atomically with Neon.
// The final check catches intervening edits before submission. A post-write recheck catches
// later edits but cannot undo an already committed initial seed; gates stay off on failure.
await checkSanityRevisions();
await checkDatabaseEmpty();
console.log(JSON.stringify({...baseReport, status:'Checks passed; invoking one-time DBK-51 atomic seed function',
  note:'All ten gates remain off. Keep all live Sanity stock writes frozen.'},null,2));

const seeded = await sql`SELECT public.dbk51_seed_stock(${plan.fingerprint}, ${JSON.stringify(plan.rows)}::jsonb, ${plan.balanceCount}) AS result`;
// A committed seed is not yet permission to switch any traffic.
const storedConfig = await sql`SELECT seed_fingerprint, writes_enabled FROM public.dbk51_stock_engine_config WHERE singleton`;
const persisted = await sql`SELECT product_id, variant_id, location_id, on_hand::text AS on_hand,
  incoming::text AS incoming, product_revision, inventory_revision, seed_fingerprint
  FROM public.dbk51_stock_balances`;
const verified = verifyPersistedRows(plan, persisted, storedConfig[0]?.seed_fingerprint, storedConfig[0]?.writes_enabled);
await checkSanityRevisions();
const afterGates = await sql`
  SELECT 'dbk51_stock_engine_config' AS name,writes_enabled AS enabled FROM public.dbk51_stock_engine_config WHERE singleton
  UNION ALL SELECT 'dbk55_settlement_config',enabled FROM public.dbk55_settlement_config WHERE singleton
  UNION ALL SELECT 'dbk56_ledger_config',enabled FROM public.dbk56_ledger_config WHERE singleton
  UNION ALL SELECT 'dbk57_manual_sale_config',enabled FROM public.dbk57_manual_sale_config WHERE singleton
  UNION ALL SELECT 'dbk62_cutover_config',enabled FROM public.dbk62_cutover_config WHERE singleton
  UNION ALL SELECT 'dbk63_financial_config',enabled FROM public.dbk63_financial_config WHERE singleton
  UNION ALL SELECT 'dbk64_online_config',enabled FROM public.dbk64_online_config WHERE singleton
  UNION ALL SELECT 'dbk65_online_fulfilment_config',enabled FROM public.dbk65_online_fulfilment_config WHERE singleton
  UNION ALL SELECT 'dbk68_daraja_config',enabled FROM public.dbk68_daraja_config WHERE singleton
  UNION ALL SELECT 'dbk69_inventory_config',enabled FROM public.dbk69_inventory_config WHERE singleton`;
if (afterGates.length !== GATE_TABLES.length || afterGates.some(r=>r.enabled !== false))
  throw new Error('POST-SEED GATE FAILURE: do not cut over');
if (seeded[0]?.result?.fingerprint !== plan.fingerprint ||
    Number(seeded[0]?.result?.seeded) !== plan.balanceCount || seeded[0]?.result?.writesEnabled !== false)
  throw new Error('Seed result contract mismatch: do not cut over');
console.log(JSON.stringify({stage:'DBK-71',status:'PRODUCTION_STOCK_SEEDED_AND_VERIFIED',
  verified, gatesDisabled:afterGates.length, sourceRevisionsStillMatch:true,
  transactionWritesEnabled:false, applicationCutoverPerformed:false,
  next:'Keep stock writes frozen until coordinated cutover/acceptance; do not enable gates automatically.'},null,2));
