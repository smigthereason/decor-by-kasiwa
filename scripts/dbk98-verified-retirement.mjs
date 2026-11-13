#!/usr/bin/env node
/**
 * DBK-98. Historical-copy retirement with exact archived SHA and Sanity revision.
 * SAFE DEFAULT = PLAN. All removals conditional and in batches <=25.
 * This tool does NOT remove orders, payment transactions, customer records,
 * inventory stock balances, or any non-SALE movements.
 * Run from original project root with --env-file=.env --env-file=.env.local.
 */
import { createReadStream, statSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { exactArchive, fingerprint, isAuditCandidate, isSaleCandidate, terminalOrder } from './dbk98-retirement-core.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(s=>{const [key,...rest]=s.replace(/^--/,'').split('='); return [key,rest.join('=')||'true'];}));
const kind=args.kind;
const mode=args.mode||'plan';
const backup=args.backup;
const expectedSha=args.sha;
const max=Number(args.max||250);
const BATCH=25;
const TARGET_HOST='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech';
const SANITY_PROJECT='g34n810u';
const SANITY_API=`https://${SANITY_PROJECT}.api.sanity.io/v2025-02-19`;
const cutoff=Date.now()-72*60*60*1000;
const allowedKind=['audit','sale'];
if (!allowedKind.includes(kind) || !['plan','retire'].includes(mode) ||
    !Number.isSafeInteger(max) || max<1 || max>4000 || !backup ||
    !/^[0-9a-f]{64}$/i.test(expectedSha||''))
  throw Error('Usage: --kind=audit|sale --mode=plan|retire --backup=/path/FRESH.tar.gz --sha=<64 hex> --max=1..4000');
if (!existsSync(backup)) throw Error('Backup missing');
const stat=statSync(backup);
if (stat.size<100_000 || Date.now()-stat.mtimeMs>60*60*1000 || stat.mtimeMs>Date.now()+60_000)
  throw Error('Backup must be fresh (<60 minutes) and nonempty');
const h=createHash('sha256');
for await (const part of createReadStream(backup)) h.update(part);
if(h.digest('hex')!==expectedSha.toLowerCase()) throw Error('Backup SHA mismatch');
const dbUrl=process.env.DATABASE_URL;
const db=dbUrl && new URL(dbUrl);
if (!db || db.hostname!==TARGET_HOST || db.pathname!=='/neondb' ||
    (process.env.NEXT_PUBLIC_SANITY_PROJECT_ID||process.env.SANITY_PROJECT_ID)!==SANITY_PROJECT ||
    (process.env.NEXT_PUBLIC_SANITY_DATASET||process.env.SANITY_DATASET)!=='production' ||
    !process.env.SANITY_API_WRITE_TOKEN)
  throw Error('Pinned production identity mismatch. STOP');
if(mode==='retire') {
  if(process.env.DBK98_RETIRE_APPROVED!=='YES')throw Error('Explicit DBK98_RETIRE_APPROVED=YES required');
  if(kind==='sale')throw Error('SALE deletion deliberately disabled: production readers remain incomplete');
  if(kind==='audit' && process.env.DBK98_AUDIT_HISTORY_LIVE_VERIFIED!=='YES')
    throw Error('Production audit archive reader not manually verified');
  
}
const {neon}=await import('@neondatabase/serverless');
const sql=neon(dbUrl);
const check=await sql`SELECT current_database() AS name,
  to_regclass('public.dbk_sanity_operational_archive')::text AS audit_archive,
  to_regclass('public.dbk82_inventory_movement_archive')::text AS movement_archive`;
if(check[0]?.name!=='neondb'||!check[0]?.audit_archive||!check[0]?.movement_archive)
  throw Error('Production Neon archive table(s) missing');
const token=process.env.SANITY_API_WRITE_TOKEN;
async function query(q, params={}) {
  const url=new URL(`${SANITY_API}/data/query/production`);
  url.searchParams.set('query',q);
  for(const [k,v] of Object.entries(params))url.searchParams.set(`$${k}`,JSON.stringify(v));
  const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60_000),cache:'no-store'});
  if(!response.ok) throw Error(`Sanity query HTTP ${response.status}: ${String(await response.text()).slice(0,250)}`);
  const body=await response.json();
  if(!Array.isArray(body.result) && typeof body.result !=='number') throw Error('Invalid Sanity query response');
  return body.result;
}
const snapshots=new Map();
const extractor='scripts/dbk98_extract_docs.py';
if(!existsSync(extractor))throw Error('Existing DBK-46 Sanity backup extractor missing');
const child=spawn('python3',[extractor,backup],{stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',s=>{stderr+=s;if(stderr.length>1000)stderr=stderr.slice(-1000);});
const exited=new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});
for await(const line of createInterface({input:child.stdout,crlfDelay:Infinity})) {
  if(!line.trim())continue;
  const doc=JSON.parse(line);
  if((kind==='audit'?isAuditCandidate:isSaleCandidate)(doc,cutoff)){
    if(snapshots.has(doc._id))throw Error('Duplicate ID in backup');
    snapshots.set(doc._id,doc);
  }
}
if(await exited!==0)throw Error(`Backup extraction failed: ${stderr.slice(0,200)}`);

// Only existing Neon archive rows are eligible. Do not silently archive
// new financial evidence or purge unverified rows in this emergency script.
const index=new Map();
let cursor='';
for(let page=0;page<80;page++){
  const rows=kind==='audit' ? await sql`
    SELECT sanity_id,source_revision,source_sha256,document_json
    FROM public.dbk_sanity_operational_archive
    WHERE document_type='auditEvent' AND sanity_id>${cursor}
    ORDER BY sanity_id LIMIT 300` : await sql`
    SELECT sanity_id,source_revision,source_sha256,document_json
    FROM public.dbk82_inventory_movement_archive
    WHERE document_json->>'movementType'='SALE' AND sanity_id>${cursor}
    ORDER BY sanity_id LIMIT 300`;
  if(rows.length===0)break;
  for(const row of rows){if(snapshots.has(row.sanity_id))index.set(row.sanity_id,row);}
  cursor=rows.at(-1).sanity_id;
  if(rows.length<300)break;
  if(page===79)throw Error('Archive pagination bound exceeded');
}
const archived=[...snapshots.values()].filter(d=>exactArchive(d,index.get(d._id)));
// Live terminal-order checks are relevant only to movements. Audit logs
// remain retrievable in Neon regardless of the related order's payment state.
const orders=new Map();
if(kind==='sale') {
  const orderIds=[...new Set(archived.map(d=>d.order._ref))];
  for(let i=0;i<orderIds.length;i+=75){
    const batch=orderIds.slice(i,i+75);
    const found=await query(`*[_type=='commerceOrder' && _id in $ids]{_id,paymentStatus,status,balanceDue,inventoryReviewRequired,refundedAmount}`,{ids:batch});
    for(const d of found) orders.set(d._id,d);
  }
}
// Audit events are immutable historical evidence. Their retrieval is covered by
// the Neon archive reader, so related orders need not be paid or delivered.
// SALE movements remain financially sensitive and retain terminal-order checks.
const eligible=archived.filter(d=>kind==='audit' || terminalOrder(orders.get(d.order._ref)))
  .sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||a._id.localeCompare(b._id));
const summary={mode,kind,backupDocumentsEligible:snapshots.size,archiveChecksumAndRevisionExact:archived.length,
  verifiedRetirementEligible:eligible.length,finalPaidOrdersEligible:kind==='sale'?eligible.length:null,maxPerRun:max,retirementPossibleThisRun:Math.min(max,eligible.length),
  note:'Only source copies are candidates; Neon archive remains the historical evidence. No stock, payment or order changes.'};
if(mode==='plan') {console.log(JSON.stringify({...summary,deleted:0,results:'PLAN_ONLY'},null,2));process.exit(0);}
if(eligible.length<max)throw Error(`STOP: Requested ${max} exceeds exactly eligible ${eligible.length}; no deletions performed`);

let deleted=0;
for(let i=0;i<max;i+=BATCH){
  const batch=eligible.slice(i,Math.min(i+BATCH,max));
  const ids=batch.map(d=>d._id);
  // Full live-document SHA and exact _rev check immediately before each mutation.
  const live=await query('*[_id in $ids]',{ids});
  const actual=new Map(live.map(d=>[d._id,d]));
  if(actual.size!==batch.length)throw Error(`STOP: Live document count changed after ${deleted} removals`);
  for(const d of batch){
    const now=actual.get(d._id), archive=index.get(d._id);
    if(!now||now._rev!==d._rev||fingerprint(now)!==fingerprint(d)||!exactArchive(now,archive)||
       !(kind==='audit'?isAuditCandidate:isSaleCandidate)(now,cutoff))
       throw Error(`STOP: Live revision, checksum or candidate condition changed after ${deleted} removals`);
  }
  // Reject document references to any source copies (the source doc has
  // references to product/order, which are unaffected by deleting the source).
  const refs=await query('count(*[references($ids)])',{ids});
  if(refs!==0)throw Error(`STOP: Existing document references candidate records; already retired ${deleted}`);
  if (kind==='sale') {
    const related=[...new Set(batch.map(d=>d.order._ref))];
    const currentOrders=await query(`*[_type=='commerceOrder' && _id in $ids]{_id,paymentStatus,status,balanceDue,inventoryReviewRequired,refundedAmount}`,{ids:related});
    const current=new Map(currentOrders.map(d=>[d._id,d]));
    if(batch.some(d=>!terminalOrder(current.get(d.order._ref))))
      throw Error(`STOP: Order settlement/status changed after ${deleted} removals`);
  }
  // Sanity conditional deletes: no modification to any other collection.
  const response=await fetch(`${SANITY_API}/data/mutate/production?returnIds=true`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({mutations:batch.map(d=>({delete:{id:d._id,ifRevisionID:d._rev}}))}),
    signal:AbortSignal.timeout(60_000),cache:'no-store',
  });
  if(!response.ok)throw Error(`STOP: Sanity conditional delete HTTP ${response.status} after ${deleted} removals`);
  const result=await response.json();
  if(result.results?.length!==batch.length)throw Error(`STOP: Sanity mutation result count mismatch after ${deleted} removals`);
  deleted+=batch.length;
  console.error(`[DBK97] ${kind} verified historical copies retired ${deleted}/${max}`);
}
const remaining=await query('count(*[])');
console.log(JSON.stringify({...summary,deleted,liveSanityDocumentCount:remaining,quotaHeadroom:Math.max(0,25000-remaining)},null,2));
