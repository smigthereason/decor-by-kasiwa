/**
 * DBK-36 v6: one-shot main-production architecture audit.
 * READ-ONLY: every database statement in this file begins with SELECT.
 * Do not use this script to enable cutover gates or import historical payment.
 * Run in ~/Work/decor-by-kasiwa with Node >=22 and dependencies installed.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const expectedRoot = resolve(process.env.HOME || '', 'Work/decor-by-kasiwa');
const currentRoot = resolve(process.cwd());
if (currentRoot !== expectedRoot || !existsSync('lib/db/dbk62-pos-cutover.ts')) {
  console.error('STOP: Run only from ~/Work/decor-by-kasiwa; refusing unknown repository.');
  process.exit(2);
}
if (typeof process.loadEnvFile === 'function' && existsSync('.env.local')) {
  process.loadEnvFile('.env.local');
}
const expectedHost = 'ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
let u;
try { u = new URL(process.env.DATABASE_URL || ''); } catch {
  console.error('STOP: DATABASE_URL not found. Set it privately for main Neon, or in the production repo .env.local.');
  process.exit(2);
}
if (!['postgres:', 'postgresql:'].includes(u.protocol) || u.hostname !== expectedHost ||
    u.pathname !== '/neondb' || !u.password) {
  console.error('STOP: Not the source-pinned Decor By Kasiwa MAIN Neon host. No database request was sent.');
  console.error('Provided host:', u.hostname || '(none)');
  process.exit(2);
}

const {neon} = await import('@neondatabase/serverless');
const sql = neon(u.toString());
const requiredTables = [
  'dbk51_stock_balances', 'dbk51_stock_engine_config', 'dbk54_stock_batches',
  'dbk55_paid_pos_settlements', 'dbk55_settlement_config',
  'dbk56_pos_orders', 'dbk56_pos_payments', 'dbk56_ledger_config',
  'dbk62_cutover_config', 'dbk68_daraja_orders',
];
const optionalTables = ['dbk69_inventory_config', 'dbk36_wa_production_import_config',
  'dbk36_wa_production_imports'];
const requiredFunctions = ['dbk54_apply_stock_batch', 'dbk55_record_paid_pos',
  'dbk56_create_pos_order', 'dbk56_record_pos_payment'];
const existingTables = await sql`SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_type='BASE TABLE'`;
const present = new Set(existingTables.map(x=>x.table_name));
const functions = await sql`SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'`;
const actualFunctions = new Set(functions.map(x=>x.proname));
const gateReaders = {
  dbk51_stock_engine_config: () => sql`SELECT to_jsonb(t) AS value FROM public.dbk51_stock_engine_config t LIMIT 1`,
  dbk55_settlement_config: () => sql`SELECT to_jsonb(t) AS value FROM public.dbk55_settlement_config t LIMIT 1`,
  dbk56_ledger_config: () => sql`SELECT to_jsonb(t) AS value FROM public.dbk56_ledger_config t LIMIT 1`,
  dbk62_cutover_config: () => sql`SELECT to_jsonb(t) AS value FROM public.dbk62_cutover_config t LIMIT 1`,
  dbk69_inventory_config: () => sql`SELECT to_jsonb(t) AS value FROM public.dbk69_inventory_config t LIMIT 1`,
  dbk36_wa_production_import_config: () => sql`SELECT to_jsonb(t) AS value FROM public.dbk36_wa_production_import_config t LIMIT 1`,
};
const safeGateKeys = new Set(['enabled','writes_enabled','sanity_stock_frozen','all_stock_writers_switched',
 'provider_callbacks_ready','receivables_ready','refunds_ready','reports_ready']);
const gateData = {};
const rawGates = {};
const warnings = [];
for (const [name, reader] of Object.entries(gateReaders)) {
  if (!present.has(name)) {gateData[name] = {state:'TABLE_MISSING'}; continue;}
  try {
    const rows = await reader();
    const value = rows[0]?.value;
    if (!value) {gateData[name] = {state:'ROW_MISSING'};continue;}
    rawGates[name] = value;
    gateData[name] = Object.fromEntries(Object.entries(value)
      .filter(([k,v])=>safeGateKeys.has(k) && typeof v === 'boolean'));
  } catch (e) {
    gateData[name] = {state:'UNAVAILABLE'};
    warnings.push(`Could not inspect ${name} gate (${e?.code || 'query error'}).`);
  }
}
let fingerprintsAgree = null;
const a=rawGates.dbk51_stock_engine_config?.seed_fingerprint;
const b=rawGates.dbk62_cutover_config?.reconciliation_fingerprint;
if (typeof a==='string' && typeof b==='string') fingerprintsAgree = a.length>=32 && a===b;

let stockLocations=[];
if (present.has('dbk51_stock_balances')) {
  try {
    stockLocations = (await sql`SELECT location_id,COUNT(*)::integer AS stock_rows,
        SUM(on_hand)::text AS units FROM public.dbk51_stock_balances
        GROUP BY location_id ORDER BY stock_rows DESC LIMIT 20`)
      .map(x=>({locationId:x.location_id,stockRows:x.stock_rows,units:x.units}));
  } catch (e) {warnings.push(`Stock location query unavailable (${e?.code || 'query error'}).`);}
}
const receipt = 'UKB7F20E0A';
const duplicateReaders = {
  dbk55_paid_pos_settlements: () => sql`SELECT count(*)::integer AS matches FROM public.dbk55_paid_pos_settlements
     WHERE payment_provider='daraja' AND provider_receipt=${receipt}`,
  dbk56_pos_payments: () => sql`SELECT count(*)::integer AS matches FROM public.dbk56_pos_payments
     WHERE provider='daraja' AND provider_reference=${receipt}`,
  dbk68_daraja_orders: () => sql`SELECT count(*)::integer AS matches FROM public.dbk68_daraja_orders
     WHERE receipt_number=${receipt}`,
  dbk36_wa_production_imports: () => sql`SELECT count(*)::integer AS matches FROM public.dbk36_wa_production_imports
     WHERE provider_receipt=${receipt}`,
};
const duplicateCounts={};
for (const [name, reader] of Object.entries(duplicateReaders)) {
  if (!present.has(name)) {duplicateCounts[name]='TABLE_MISSING'; continue;}
  try {duplicateCounts[name] = Number((await reader())[0]?.matches ?? 0);}
  catch (e) {duplicateCounts[name]='QUERY_UNAVAILABLE';warnings.push(`Duplicate receipt check unavailable in ${name} (${e?.code||'query error'}).`);}
}
const missingTables = requiredTables.filter(name=>!present.has(name));
const missingFunctions = requiredFunctions.filter(name=>!actualFunctions.has(name));
const mandatoryGates=['dbk51_stock_engine_config','dbk55_settlement_config',
  'dbk56_ledger_config','dbk62_cutover_config'];
const gateFlagsReady = mandatoryGates.every(g=>{
  const x=gateData[g]; return x && x.state===undefined &&
    (g==='dbk51_stock_engine_config'?x.writes_enabled === true:x.enabled === true);
});
const cutover=gateData.dbk62_cutover_config || {};
const cutoverReady = ['sanity_stock_frozen','all_stock_writers_switched',
  'provider_callbacks_ready','receivables_ready','refunds_ready','reports_ready']
  .every(k=>cutover[k] === true) && fingerprintsAgree === true;
const dupeDetected=Object.values(duplicateCounts).some(v=>typeof v==='number' && v>0);
const dupeUncertain=Object.values(duplicateCounts).some(v=>v==='QUERY_UNAVAILABLE');
let decision;
if (missingTables.length || missingFunctions.length) decision='BLOCKED_MISSING_CORE_SCHEMA';
else if (!gateFlagsReady || !cutoverReady) decision='BLOCKED_MAIN_CUTOVER_GATES_NOT_READY';
else if (dupeDetected) decision='BLOCKED_RECEIPT_ALREADY_RECORDED_RECONCILE';
else if (dupeUncertain) decision='BLOCKED_RECEIPT_UNVERIFIED';
else decision='STRUCTURAL_PRECHECK_PASS_MANUAL_RECONCILIATION_STILL_REQUIRED';
const output = {
  target:'MAIN_DECOR_BY_KASIWA_NEON',hostVerified:true,database:'neondb',
  decision,requiredTables:Object.fromEntries(requiredTables.map(n=>[n,present.has(n)])),
  optionalTables:Object.fromEntries(optionalTables.map(n=>[n,present.has(n)])),
  requiredFunctions:Object.fromEntries(requiredFunctions.map(n=>[n,actualFunctions.has(n)])),
  gateFlags:gateData,stockFingerprintMatchesCutover:fingerprintsAgree,
  stockLocations,existingReceiptUKB7F20E0A:duplicateCounts,
  warnings,
  reminder:'READ ONLY. This does not authorize applying v6 migration, switching gates, or importing the payment.'
};
console.log(JSON.stringify(output,null,2));
if (decision!=='STRUCTURAL_PRECHECK_PASS_MANUAL_RECONCILIATION_STILL_REQUIRED') process.exitCode=3;
