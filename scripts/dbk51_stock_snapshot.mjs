#!/usr/bin/env node
// DBK-51: read-only snapshot planner; optional guarded seed into an isolated Neon TEST BRANCH.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { buildStockSnapshot } from './dbk51_stock_core.mjs';

const [archive, ...args] = process.argv.slice(2);
const apply = args.includes('--seed-test');
const confirmations = args.filter(s => s.startsWith('--confirm-fingerprint='));
if (!archive || !existsSync(archive) || args.some(s => s !== '--seed-test' && !s.startsWith('--confirm-fingerprint=')) ||
    (apply && confirmations.length !== 1) || (!apply && confirmations.length)) {
  console.error('Usage: node scripts/dbk51_stock_snapshot.mjs /private/path/export.tar.gz [--seed-test --confirm-fingerprint=<PLAN_FINGERPRINT>]');
  process.exit(2);
}
const entries = execFileSync('tar', ['-tzf', archive], { encoding:'utf8', maxBuffer: 16*1024*1024 })
  .split('\n').filter(Boolean);
const dataFile = entries.find(name => name === 'data.ndjson' || name.endsWith('/data.ndjson'));
if (!dataFile) throw new Error('Cannot locate data.ndjson in Sanity export');
const data = execFileSync('tar', ['-xOzf', archive, dataFile], { encoding:'utf8', maxBuffer: 512*1024*1024 });
const docs = [];
for (const [i, line] of data.split('\n').entries()) {
  if (!line.trim()) continue;
  let doc;
  try { doc = JSON.parse(line); }
  catch { throw new Error(`Invalid JSON at export line ${i+1}`); }
  if (doc._type === 'product' || doc._type === 'inventoryRecord') docs.push(doc);
}
const plan = buildStockSnapshot(docs);
const fileHash = createHash('sha256');
for await (const chunk of createReadStream(archive)) fileHash.update(chunk);
const result = {
  stage:'DBK-51',mode:apply?'ISOLATED TEST SEED REQUESTED':'READ ONLY PLAN',
  exportFilename:basename(archive),exportSha256:fileHash.digest('hex'),
  productCount:plan.productCount,inventoryRecords:plan.inventoryRecordCount,
  balanceRows:plan.balanceCount,quantityTotals:plan.quantityTotals,
  quantityClassification:plan.quantityClassification,
  quarantinedProductCount:plan.quarantinedProducts.length,
  quarantinedProducts:plan.quarantinedProducts,
  fingerprint:plan.fingerprint,safeToSeed:plan.safeToSeed,
  problemCount:plan.problems.length,problems:plan.problems.slice(0,40),
  note:'Snapshot is NOT live authoritative stock. No Sanity writes, no cutover and no production stock change.'
};
console.log(JSON.stringify(result,null,2));
if (!apply) process.exit(0);
if (!plan.safeToSeed) throw new Error('Seed blocked: source quantity/variant conflicts');
const confirmation = confirmations[0]?.split('=')[1];
if (confirmation !== plan.fingerprint) throw new Error('Plan fingerprint mismatch: no writes performed');
const url = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL);
const expected = process.env.DBK51_EXPECTED_TEST_HOST;
const production = process.env.DBK51_PRODUCTION_HOST;
if (!url || !expected || !production || expected === production || url.hostname !== expected || url.hostname === production ||
    process.env.DBK51_TEST_WRITE !== 'YES') {
  throw new Error('Test branch safety gate failed. DATABASE_URL must be distinct from verified production host.');
}
const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
const before = await sql`SELECT to_regclass('public.dbk51_stock_balances') AS balance_table,
  to_regclass('public.dbk51_stock_operations') AS operation_table`;
if (!before[0]?.balance_table || !before[0]?.operation_table) throw new Error('Apply DBK-51 schema to TEST BRANCH first');
// All rows commit or roll back as a single PostgreSQL function invocation.
const saved = await sql`SELECT public.dbk51_seed_stock(${plan.fingerprint}, ${JSON.stringify(plan.rows)}::jsonb, ${plan.balanceCount}) AS result`;
const checked = await sql`SELECT count(*)::int AS rows, coalesce(sum(on_hand),0)::text AS on_hand,
  coalesce(sum(incoming),0)::text AS incoming FROM public.dbk51_stock_balances`;
if (Number(checked[0].rows) !== plan.balanceCount || Number(checked[0].on_hand) !== plan.quantityTotals.onHand ||
    Number(checked[0].incoming) !== plan.quantityTotals.incoming) throw new Error('Seed post-check FAILED. Do not enable stock writes.');
console.log(JSON.stringify({stage:'DBK-51',mode:'TEST BRANCH SEED COMPLETE',result:saved[0].result,verified:checked[0],writesEnabled:false,sanityWrites:0},null,2));
