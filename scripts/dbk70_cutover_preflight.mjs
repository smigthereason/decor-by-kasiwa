#!/usr/bin/env node
// DBK-70: read-only production cutover assessment; NEVER writes to Sanity/Neon.
// Usage: DBK70_EXPECTED_PRODUCTION_HOST=... node --env-file=.env.local scripts/dbk70_cutover_preflight.mjs <fresh Sanity export.tar.gz>
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { buildStockSnapshot } from './dbk51_stock_core.mjs';
import { compareRevisions, EXPECTED_TABLES, validateProductionHost, classifyPreflight } from './dbk70_cutover_core.mjs';

const archive = process.argv[2];
if (process.argv.length !== 3 || !archive || !existsSync(archive)) {
  console.error('Usage: node scripts/dbk70_cutover_preflight.mjs /private/path/fresh-export.tar.gz');
  process.exit(2);
}
if ((process.env.NEXT_PUBLIC_SANITY_DATASET || 'production') !== 'production') throw new Error('SANITY dataset must be production');
if (!process.env.NEXT_PUBLIC_SANITY_PROJECT_ID) throw new Error('Sanity project ID missing');
const host = validateProductionHost(process.env.DATABASE_URL, process.env.DBK70_EXPECTED_PRODUCTION_HOST);
const entries = execFileSync('tar', ['-tzf', archive], { encoding:'utf8', maxBuffer:16*1024*1024 }).split('\n').filter(Boolean);
const ndjson = entries.find(e => e === 'data.ndjson' || e.endsWith('/data.ndjson'));
if (!ndjson) throw new Error('No data.ndjson in export archive');
const content = execFileSync('tar', ['-xOzf', archive, ndjson], { encoding:'utf8', maxBuffer:512*1024*1024 });
const documents=[];
for (const [index,line] of content.split('\n').entries()) {
  if (!line.trim()) continue;
  let row;
  try { row = JSON.parse(line); } catch { throw new Error(`Invalid JSON on line ${index+1}`); }
  if (row._type === 'product' || row._type === 'inventoryRecord') documents.push(row);
}
const plan=buildStockSnapshot(documents);
const hash=createHash('sha256');
for await (const chunk of createReadStream(archive)) hash.update(chunk);
const archiveHash=hash.digest('hex');
const { createClient } = await import('@sanity/client');
const token = (process.env.SANITY_API_READ_TOKEN || process.env.SANITY_API_WRITE_TOKEN || '').replace(/^['"]|['"]$/g,'');
if (!token) throw new Error('Sanity token needed for revision comparison');
const sanity=createClient({
  projectId:process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset:'production',apiVersion:'2026-08-27',useCdn:false,token,perspective:'published',
});
const liveDocs=await sanity.fetch('*[_type in ["product","inventoryRecord"] && !(_id in path("drafts.**"))]{_id,_type,_rev}',{},{cache:'no-store'});
const revisions=compareRevisions(documents,liveDocs);
const { neon }=await import('@neondatabase/serverless');
const sql=neon(process.env.DATABASE_URL);
const tableRows=await sql`SELECT name, to_regclass('public.' || name)::text AS relation
  FROM unnest(string_to_array(${EXPECTED_TABLES.join(',')}, ',')) AS name ORDER BY name`;
const missingTables=tableRows.filter(row=>!row.relation).map(row=>row.name);
let balanceRows=0, stockOperations=0, seedFingerprint=null, activeGates=[];
const exists=(name)=>!missingTables.includes(name);
if (exists('dbk51_stock_balances')) {
  const rs=await sql`SELECT count(*)::int AS n FROM public.dbk51_stock_balances`;
  balanceRows=Number(rs[0]?.n || 0);
}
if (exists('dbk51_stock_operations')) {
  const rs=await sql`SELECT count(*)::int AS n FROM public.dbk51_stock_operations`;
  stockOperations=Number(rs[0]?.n || 0);
}
if (exists('dbk51_stock_engine_config')) {
  const rs=await sql`SELECT seed_fingerprint, writes_enabled FROM public.dbk51_stock_engine_config WHERE singleton`;
  seedFingerprint=rs[0]?.seed_fingerprint || null;
  if(rs[0]?.writes_enabled) activeGates.push('dbk51_stock_engine_config');
}
const gateReads = [
  ['dbk55_settlement_config',()=>sql`SELECT enabled FROM public.dbk55_settlement_config WHERE singleton`],
  ['dbk56_ledger_config',()=>sql`SELECT enabled FROM public.dbk56_ledger_config WHERE singleton`],
  ['dbk57_manual_sale_config',()=>sql`SELECT enabled FROM public.dbk57_manual_sale_config WHERE singleton`],
  ['dbk62_cutover_config',()=>sql`SELECT enabled FROM public.dbk62_cutover_config WHERE singleton`],
  ['dbk63_financial_config',()=>sql`SELECT enabled FROM public.dbk63_financial_config WHERE singleton`],
  ['dbk64_online_config',()=>sql`SELECT enabled FROM public.dbk64_online_config WHERE singleton`],
  ['dbk65_online_fulfilment_config',()=>sql`SELECT enabled FROM public.dbk65_online_fulfilment_config WHERE singleton`],
  ['dbk68_daraja_config',()=>sql`SELECT enabled FROM public.dbk68_daraja_config WHERE singleton`],
  ['dbk69_inventory_config',()=>sql`SELECT enabled FROM public.dbk69_inventory_config WHERE singleton`],
];
for (const [table, query] of gateReads) {
  if (!exists(table)) continue;
  const rows=await query();
  if (rows[0]?.enabled) activeGates.push(table);
}
const neonState={ missingTables,balanceRows,stockOperations,seedFingerprint,activeGates };
const decision=classifyPreflight({plan,revisions,neon:neonState});
console.log(JSON.stringify({
  stage:'DBK-70', mode:'READ_ONLY_CUTOVER_PREFLIGHT',
  sanityExport:{filename:basename(archive),sha256:archiveHash,products:plan.productCount,
    inventoryRecords:plan.inventoryRecordCount,balanceRows:plan.balanceCount,
    onHand:plan.quantityTotals.onHand,incoming:plan.quantityTotals.incoming,
    quarantineUnits:plan.quantityClassification?.quarantinedOnHand ?? null,
    fingerprint:plan.fingerprint,safeToSeed:plan.safeToSeed,problemCount:plan.problems.length},
  sanityLiveRevisions:revisions,
  neonProduction:{host, ...neonState},decision,
  writesPerformed:0,
},null,2));
if (!decision.eligibleForFrozenStockSeedReview) process.exitCode=3;
