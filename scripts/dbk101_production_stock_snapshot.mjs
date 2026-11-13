#!/usr/bin/env node
/**
 * DBK-101 live stock snapshot and guarded, initial-only Neon production seed.
 *  --plan: read-only, one bounded scan of current Sanity product/inventory records;
 *          compare with production Neon DBK-51.
 *  --seed --expect-fingerprint=<sha256> --confirm-writes-frozen:
 *          require external operational freeze, scan twice, then only seed an
 *          empty DBK-51 stock ledger atomically; NEVER enable payment/writer gates.
 *
 * IMPORTANT: This is not a financial cutover script. Existing Neon/manual/STK
 * database locks remain OFF; no real payment actions are performed.
 */
import {createHash} from 'node:crypto';
import {buildStockSnapshot} from './dbk51_stock_core.mjs';
import {reconcileRows} from './dbk54_reconcile_core.mjs';

const HOST='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const PROJECT='g34n810u';
const DATASET='production';
const args=process.argv.slice(2);
const seed=args.includes('--seed');
const plan=args.includes('--plan');
const frozen=args.includes('--confirm-writes-frozen');
const expectedArg=args.find(a=>a.startsWith('--expect-fingerprint='));
if((seed===plan)||args.some(a=>a!== '--seed' && a!== '--plan' && a!== '--confirm-writes-frozen' && !a.startsWith('--expect-fingerprint=')) ||
   (seed && (!frozen || !expectedArg || !/^[0-9a-f]{64}$/.test(expectedArg.split('=')[1]))) || (plan&&(frozen||expectedArg))) {
  console.error('Usage: --plan OR --seed --expect-fingerprint=<64-char SHA256> --confirm-writes-frozen');
  process.exit(2);
}
function stop(message){throw new Error(message)}
const raw=process.env.DATABASE_URL;
if(!raw) stop('DATABASE_URL missing; refuses to guess production database');
const u=new URL(raw);
if(!['postgres:','postgresql:'].includes(u.protocol)||u.hostname!==HOST||u.pathname!=='/neondb')
  stop('Refusing non-production Neon target');
const project=process.env.NEXT_PUBLIC_SANITY_PROJECT_ID||process.env.SANITY_PROJECT_ID;
const dataset=process.env.NEXT_PUBLIC_SANITY_DATASET||process.env.SANITY_DATASET||DATASET;
if(project!==PROJECT||dataset!==DATASET) stop('Sanity project/dataset is not the authorized Decor By Kasiwa production source');
const token=process.env.SANITY_API_READ_TOKEN||process.env.SANITY_READ_TOKEN||process.env.SANITY_API_WRITE_TOKEN||process.env.SANITY_API_TOKEN||'';
if(!token) stop('No local Sanity read token available; cannot read authoritative stock');
const {neon}=await import('@neondatabase/serverless');
const sql=neon(raw);
const endpoint=`https://${PROJECT}.api.sanity.io/v2026-08-27/data/query/${DATASET}`;
async function groq(query) {
  const q=new URL(endpoint);
  q.searchParams.set('query',query);
  const r=await fetch(q,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  const body=await r.json().catch(()=>null);
  if(!r.ok || body?.error)stop(`Sanity inventory read failed (${r.status}): ${String(body?.error?.type||body?.error?.description||'unknown')}`);
  if(!('result' in (body||{})))stop('Sanity query response missing result');
  return body.result;
}
const filter='(_type == "product" || _type == "inventoryRecord") && !(_id in path("drafts.**"))';
async function liveSnapshot(){
  const before=await groq(`count(*[${filter}])`);
  if(!Number.isSafeInteger(before)||before<1||before>10000)stop(`Unexpected live stock document count ${before}`);
  const documents=[];
  let after='';
  while(documents.length<before){
    const expr=`*[${filter} && _id > ${JSON.stringify(after)}] | order(_id asc)[0...200]`;
    const page=await groq(expr);
    if(!Array.isArray(page)||page.length<1)stop('Sanity stock scan stopped early');
    if(page.some(d=>!d || typeof d._id!=='string'||d._id<=after))stop('Sanity stock pagination mismatch');
    documents.push(...page);after=page.at(-1)._id;
    if(documents.length>10000)stop('Inventory doc limit exceeded');
  }
  const end=await groq(`count(*[${filter}])`);
  if(end!==before||documents.length!==before||new Set(documents.map(d=>d._id)).size!==before)
    stop('Stock documents changed during read or duplicate source IDs; freeze stock writers before retrying');
  const snapshot=buildStockSnapshot(documents);
  const revisionHash=createHash('sha256').update(JSON.stringify(documents.map(d=>[d._id,d._rev]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
  return {snapshot,revisionHash,documents:before};
}
async function neonState(){
  const [state]=await sql`
    SELECT c.enabled AS cutover_enabled,c.reconciliation_fingerprint,
      s.seed_fingerprint,s.writes_enabled,
      (SELECT count(*)::int FROM public.dbk51_stock_balances) AS balances,
      (SELECT count(*)::int FROM public.dbk51_stock_operations) AS operations,
      (SELECT count(*)::int FROM public.dbk54_stock_batches) AS batches
    FROM public.dbk62_cutover_config c
    JOIN public.dbk51_stock_engine_config s USING(singleton)
    WHERE c.singleton`;
  if(!state)stop('DBK-51 or DBK-62 singleton configuration missing; no stock changes');
  return state;
}
const current=await neonState();
const live=await liveSnapshot();
const snap=live.snapshot;
const rows=await sql`SELECT product_id,variant_id,location_id,on_hand,incoming FROM public.dbk51_stock_balances
  ORDER BY product_id,variant_id,location_id LIMIT 200001`;
if(rows.length>200000)stop('Neon stock has unexpected number of rows');
const diff=reconcileRows(snap.rows,rows);
const printable={
  stage:'DBK-101',mode:seed?'LIVE_STOCK_INITIAL_SEED':'LIVE_STOCK_READ_ONLY_PLAN',
  source:'Sanity g34n810u / production',target:'pinned Neon production',
  liveSourceDocuments:live.documents,products:snap.productCount,inventoryRecords:snap.inventoryRecordCount,
  stockRows:snap.balanceCount,stockQuantities:snap.quantityTotals,
  sourceRevisionFingerprint:live.revisionHash,stockFingerprint:snap.fingerprint,
  safeToSeed:snap.safeToSeed,stockProblems:snap.problems.slice(0,30),stockProblemCount:snap.problems.length,
  quarantinedProducts:snap.quarantinedProducts.slice(0,15),
  neon:{seeded:!!current.seed_fingerprint,stockRows:current.balances,stockOperations:current.operations,
    basketOperations:current.batches,writesEnabled:current.writes_enabled,cutoverEnabled:current.cutover_enabled,
    stockFingerprintMatches:current.seed_fingerprint===snap.fingerprint},
  parity:diff,
};
if(!seed){
  printable.nextAction=!snap.safeToSeed?'Resolve stock inconsistencies before any production seed':
    current.seed_fingerprint ? diff.inSync ? 'Stock parity matches; complete writer/callback/finance cutover controls before enabling' : 'Existing Neon seed differs; reconcile, NEVER overwrite or reseed' :
    'Initial stock seed possible ONLY after inventory writes are frozen and fingerprint is confirmed; the --seed command will not enable payments';
  console.log(JSON.stringify(printable,null,2));
  process.exit(0);
}
if(!snap.safeToSeed)stop(`Stock snapshot is inconsistent (${snap.problems.length} issues); no seed performed`);
if(current.writes_enabled || current.cutover_enabled || current.operations!==0 || current.batches!==0)
  stop('Neon stock or payment system already active/used; refusing an initial seed');
if(current.seed_fingerprint||current.balances!==0)stop('Stock seed already exists; refusing overwrite or repeated seed');
const expected=expectedArg.slice('--expect-fingerprint='.length);
if(expected!==snap.fingerprint)stop('Fingerprint changed since approved plan; no stock seed');
const again=await liveSnapshot();
if(again.snapshot.fingerprint!==snap.fingerprint || again.revisionHash!==live.revisionHash)
  stop('Stock revisions or quantities changed since the first scan; no stock seed. Confirm writes frozen.');
const [seedResult]=await sql`SELECT public.dbk51_seed_stock(
  ${snap.fingerprint},${JSON.stringify(snap.rows)}::jsonb,${snap.balanceCount}) AS result`;
const finalState=await neonState();
const target=await sql`SELECT product_id,variant_id,location_id,on_hand,incoming FROM public.dbk51_stock_balances ORDER BY product_id,variant_id,location_id`;
const finalDiff=reconcileRows(snap.rows,target);
if(finalState.seed_fingerprint!==snap.fingerprint||!finalDiff.inSync)
  stop('Stock seed returned but parity check failed. STOP; do not enable writers or attempt another seed');
console.log(JSON.stringify({...printable,
  status:'INITIAL_SEED_VERIFIED',seedResult:seedResult?.result,verifiedParity:finalDiff,
  stillDisabled:true,
  nextAction:'Complete finance/callback/report/receivable/refund and all-stock-writer cutover controls before enabling any new POS payments. Do NOT manually set 14 flags.',
},null,2));
