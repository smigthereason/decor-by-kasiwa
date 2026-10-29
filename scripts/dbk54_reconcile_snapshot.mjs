#!/usr/bin/env node
// Compares a fresh *offline* Sanity export against a seeded isolated Neon branch.
// No writes of any kind. Does not authorize production stock cutover.
import { execFileSync } from 'node:child_process';
import { existsSync,createReadStream } from 'node:fs';
import {createHash} from 'node:crypto';
import {basename} from 'node:path';
import {buildStockSnapshot} from './dbk51_stock_core.mjs';
import {reconcileRows} from './dbk54_reconcile_core.mjs';
const [archive,...args]=process.argv.slice(2);
if (!archive || !existsSync(archive) || args.length) {
  console.error('Usage: node --env-file=.env.dbk51-test.local scripts/dbk54_reconcile_snapshot.mjs /private/NEW-export.tar.gz');
  process.exit(2);
}
const u=process.env.DATABASE_URL && new URL(process.env.DATABASE_URL);
const expected=process.env.DBK51_EXPECTED_TEST_HOST,production=process.env.DBK51_PRODUCTION_HOST;
if (!u || !expected || !production || expected===production ||
    u.hostname!==expected || u.hostname===production) {
  throw new Error('REFUSING: only verified isolated DBK-51 TEST branch allowed');
}
const entries=execFileSync('tar',['-tzf',archive],{encoding:'utf8',maxBuffer:16*1024*1024}).trim().split('\n');
const ndjson=entries.find(v=>v==='data.ndjson'||v.endsWith('/data.ndjson'));
if(!ndjson) throw new Error('data.ndjson missing in export');
const data=execFileSync('tar',['-xOzf',archive,ndjson],{encoding:'utf8',maxBuffer:512*1024*1024});
const docs=[];
for(const [i,line] of data.split('\n').entries()) {
 if(!line) continue;
 let obj;try{obj=JSON.parse(line)}catch{throw new Error(`Invalid export NDJSON line ${i+1}`)}
 if(obj._type==='product'||obj._type==='inventoryRecord') docs.push(obj);
}
const plan=buildStockSnapshot(docs);
if(!plan.safeToSeed) throw new Error(`Sanity snapshot invalid: ${plan.problems.slice(0,5).join('; ')}`);
const hash=createHash('sha256');
for await (const part of createReadStream(archive)) hash.update(part);
const {neon}=await import('@neondatabase/serverless');
const sql=neon(process.env.DATABASE_URL);
const config=await sql`SELECT writes_enabled,seed_fingerprint,seed_created_at FROM public.dbk51_stock_engine_config WHERE singleton`;
if(!config[0]?.seed_fingerprint) throw new Error('Neon test branch has not been seeded');
if(config[0]?.writes_enabled) throw new Error('Neon test branch write gate must be disabled for parity audit');
const target=await sql`SELECT product_id,variant_id,location_id,on_hand,incoming FROM public.dbk51_stock_balances ORDER BY product_id,variant_id,location_id`;
const activity=await sql`SELECT (SELECT count(*) FROM public.dbk51_stock_operations)::int AS stock_ops,
  (SELECT count(*) FROM public.dbk54_stock_batches)::int AS basket_ops`;
const diff=reconcileRows(plan.rows,target);
console.log(JSON.stringify({stage:'DBK-54',mode:'READ ONLY TEST BRANCH PARITY',
 archive:basename(archive),archiveSha256:hash.digest('hex'),sourceFingerprint:plan.fingerprint,
 testSeedFingerprint:config[0].seed_fingerprint,testSeedCreatedAt:config[0].seed_created_at,
 sourceProducts:plan.productCount,quarantineOnHand:plan.quantityClassification.quarantinedOnHand,
 testActivity:activity[0],comparison:diff,
 readyForProductionCutover:false,
 note:'Differences are expected when live Sanity stock changes after the test seed. Do not overwrite test seed or switch production using this report.'},null,2));
