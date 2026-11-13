#!/usr/bin/env node
/**
 * DBK-101: one-time reconciled production stock rebaseline.
 * Freezes must be enforced outside this utility: stop POS, online checkout,
 * inventory administration, refunds, receipts and any jobs writing stock.
 * One --apply command re-reads Sanity twice, compares, stores a Neon rollback
 * snapshot in the same PostgreSQL transaction and swaps the stale seed.
 * NO financial flags, STK requests, orders or inventory movements are enabled.
 */
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {buildStockSnapshot} from './dbk51_stock_core.mjs';
import {reconcileRows} from './dbk54_reconcile_core.mjs';

const ROOT=dirname(fileURLToPath(import.meta.url));
const args=new Set(process.argv.slice(2));
const apply=args.has('--apply');
if(args.size===0||[...args].some(x=>!['--apply','--confirm-writes-frozen'].includes(x)) ||
   (apply&&!args.has('--confirm-writes-frozen'))){
  throw Error('Usage: --apply --confirm-writes-frozen (after ALL Sanity stock writes are stopped)');
}
const HASH=x=>createHash('sha256').update(x).digest('hex');
const fail=m=>{throw Error(m)};
const raw=process.env.DATABASE_URL;
if(!raw)fail('DATABASE_URL missing');
const u=new URL(raw);
const HOST='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!==HOST||u.pathname!=='/neondb')
  fail('Refusing unexpected Neon DB target');
const PROJECT='g34n810u';
const DATASET='production';
if((process.env.NEXT_PUBLIC_SANITY_PROJECT_ID||process.env.SANITY_PROJECT_ID)!==PROJECT ||
   (process.env.NEXT_PUBLIC_SANITY_DATASET||process.env.SANITY_DATASET||DATASET)!==DATASET)
  fail('Refusing unexpected Sanity project/dataset');
const token=process.env.SANITY_API_READ_TOKEN||process.env.SANITY_READ_TOKEN||process.env.SANITY_API_WRITE_TOKEN||process.env.SANITY_API_TOKEN||'';
if(!token)fail('Sanity read token missing');
const {neon}=await import('@neondatabase/serverless');
const sql=neon(raw);
const queryUrl=`https://${PROJECT}.api.sanity.io/v2026-08-27/data/query/${DATASET}`;
async function groq(query){
  const url=new URL(queryUrl);url.searchParams.set('query',query);
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  const body=await r.json().catch(()=>null);
  if(!r.ok||body?.error||!('result' in (body||{})))fail(`Sanity stock query failed HTTP ${r.status}`);
  return body.result;
}
const filter='(_type == "product" || _type == "inventoryRecord") && !(_id in path("drafts.**"))';
async function snapshot(){
  const total=await groq(`count(*[${filter}])`);
  if(!Number.isSafeInteger(total)||total<1||total>10000)fail(`Unexpected Sanity source document count: ${total}`);
  const documents=[];let cursor='';
  while(documents.length<total){
    const batch=await groq(`*[${filter} && _id > ${JSON.stringify(cursor)}] | order(_id asc)[0...200]`);
    if(!Array.isArray(batch)||batch.length===0||batch.some(d=>!d?._id||d._id<=cursor))fail('Sanity pagination failed');
    documents.push(...batch);cursor=batch.at(-1)._id;
    if(documents.length>10000)fail('Unbounded Sanity stock scan');
  }
  const post=await groq(`count(*[${filter}])`);
  if(post!==total||documents.length!==total||new Set(documents.map(d=>d._id)).size!==total)fail('Sanity source changed during scan');
  const result=buildStockSnapshot(documents);
  const rev=HASH(JSON.stringify(documents.map(d=>[d._id,d._rev]).sort((a,b)=>a[0].localeCompare(b[0]))));
  if(!result.safeToSeed || result.problems.length)fail(`Invalid Sanity stock state: ${result.problems.slice(0,4).join('; ')}`);
  return {...result,rev,docs:total};
}
const cfg=await sql`
 SELECT s.seed_fingerprint, s.writes_enabled, c.enabled AS cutover_enabled,
 (SELECT count(*)::int FROM public.dbk51_stock_balances) AS old_rows,
 (SELECT count(*)::int FROM public.dbk51_stock_operations) AS stock_ops,
 (SELECT count(*)::int FROM public.dbk54_stock_batches) AS batches,
 (SELECT count(*)::int FROM public.dbk56_pos_orders) AS pos_orders,
 (SELECT count(*)::int FROM public.dbk56_pos_payments) AS pos_payments,
 (SELECT count(*)::int FROM public.dbk62_manual_sales) AS manual_orders,
 (SELECT count(*)::int FROM public.dbk68_daraja_orders) AS daraja_orders,
 (SELECT count(*)::int FROM public.dbk69_inventory_movements) AS inventory_ops
 FROM public.dbk51_stock_engine_config s JOIN public.dbk62_cutover_config c USING(singleton)
 WHERE s.singleton`;
if(cfg.length!==1)fail('Stock/cutover config missing');
const c=cfg[0];
if(!c.seed_fingerprint||c.writes_enabled||c.cutover_enabled||
   ['stock_ops','batches','pos_orders','pos_payments','manual_orders','daraja_orders','inventory_ops'].some(k=>Number(c[k])!==0))
 fail('Neon ledger is active or has operations; cannot replace its stock baseline');
const old=await sql`SELECT product_id,variant_id,location_id,on_hand,incoming FROM public.dbk51_stock_balances ORDER BY product_id,variant_id,location_id`;
if(old.length!==Number(c.old_rows))fail('Neon balances changed during read');
const live=await snapshot();
const diff=reconcileRows(live.rows,old,200000);
const report={sourceDocs:live.docs,sanityRows:live.balanceCount,neonRows:old.length,
 sourceFingerprint:live.fingerprint,previousNeonFingerprint:c.seed_fingerprint,
 rowsToAdd:diff.addedInSanity,rowsToRemove:diff.missingInSanity,
 rowsToUpdate:diff.changedRows,alreadyInSync:diff.inSync,
 quarantinedProducts:live.quarantinedProducts.length,stockProblems:live.problems.length};
await writeFile(resolve(process.cwd(),'DBK101-stock-reconciliation-report.json'),
  JSON.stringify({...report,allDifferences:diff.topChanges},null,2));
console.log('DBK-101 CURRENT COMPARISON',JSON.stringify(report,null,2));
console.log('Saved all row-level differences to DBK101-stock-reconciliation-report.json');
if(diff.inSync){console.log('Already matching. No replacement required.');process.exit(0);}
// A second source scan detects a moving Sanity stock system. External writer freeze
// is still mandatory because no cross-database transaction can lock Sanity.
const again=await snapshot();
if(again.rev!==live.rev||again.fingerprint!==live.fingerprint)fail('Sanity changed between scans; stop stock writes and retry');
const id=`dbk101-${HASH(live.rev+':'+live.fingerprint).slice(0,24)}`;
const expectedOldRows=old.map(r=>({
 product_id:r.product_id,variant_id:r.variant_id,location_id:r.location_id,
 on_hand:Number(r.on_hand),incoming:Number(r.incoming)
}));
const migration=await readFile(resolve(ROOT,'dbk101_stock_rebaseline.sql'),'utf8');
// Create the DBK-101 audit table/function before the single atomic data edit.
// No stock changes occur during installation; each DDL is static trusted SQL.
// This SQL file contains a PL/pgSQL body; DO NOT split at semicolons.
// Safe DDL boundaries: function body is never split on semicolons.
const statements=migration.split(/^-- DBK101_STATEMENT\s*$/m).slice(1).map(x=>x.trim()).filter(Boolean);
if(statements.length!==4)fail('Unexpected DBK-101 DDL statement count');
for(const statement of statements)await sql.query(statement);
const [applied]=await sql`
 SELECT public.dbk101_rebaseline_stock(
   ${id},${again.rev},${c.seed_fingerprint},${again.fingerprint},
   ${old.length},${JSON.stringify(expectedOldRows)}::jsonb,${JSON.stringify(again.rows)}::jsonb
 ) AS result`;
const [state]=await sql`SELECT seed_fingerprint,writes_enabled FROM public.dbk51_stock_engine_config WHERE singleton`;
const [gate]=await sql`SELECT enabled,reconciliation_fingerprint FROM public.dbk62_cutover_config WHERE singleton`;
const after=await sql`SELECT product_id,variant_id,location_id,on_hand,incoming FROM public.dbk51_stock_balances ORDER BY product_id,variant_id,location_id`;
const finalDiff=reconcileRows(again.rows,after);
if(!finalDiff.inSync||state.seed_fingerprint!==again.fingerprint||gate.reconciliation_fingerprint!==again.fingerprint||state.writes_enabled||gate.enabled){
  fail(`Rebaseline committed but post-verification failed. DO NOT ENABLE PAYMENTS. Backup ID ${id}`);
}
console.log(JSON.stringify({status:'DBK101_STOCK_PARITY_RESTORED',result:applied?.result,
 stockRows:after.length,reconciled:true,backupId:id,
 paymentGate:'OFF',stockWriteGate:'OFF',next:'Verify writer/callback/financial readiness before enabling production payments'},null,2));
