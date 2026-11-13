#!/usr/bin/env node
/* DBK-82. Archive and optionally retire ONLY audited, old, exact-revision Sanity auditEvent docs.
   Defaults to read-only. Does not touch inventoryMovement, stock, orders, payments, customers.
   Archive source is an operator-created, fresh Sanity production export. */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { candidate, fingerprint, verifiedArchive, validateOptions, PINNED_HOST, CONFIRM } from './dbk85_core.mjs';

const args=process.argv.slice(2);
const mode=args.includes('--archive')?'archive':args.some(a=>a.startsWith('--commit='))?'retire':'plan';
if(mode==='archive')
  throw Error('DBK86 is retirement-only; use DBK85 for archiving.');
const getFlag=p=>args.find(a=>a.startsWith(p))?.slice(p.length);
const backup=args.find(a=>!a.startsWith('--'));
const expectedSha=getFlag('--backup-sha256=');
if (!backup || !existsSync(backup) || !/^[a-f0-9]{64}$/i.test(expectedSha||'') || args.some(a=>a.startsWith('--') && !a.startsWith('--backup-sha256=') && a!=='--archive' && !a.startsWith('--commit=') && !a.startsWith('--max='))) {
  console.error('Usage: node scripts/dbk82_archive_retire.mjs /path/to/FRESH-production.tar.gz --backup-sha256=SHA [--archive | --commit=RETIRE_VERIFIED_ARCHIVED_AUDITS --max=250]');
  process.exit(2);
}
if (mode==='retire' && args.includes('--archive')) throw Error('Cannot archive and delete in one run');
const maxArg=getFlag('--max=')||'25';
if (!/^\d+$/.test(maxArg) || Number(maxArg)<1 || Number(maxArg)>250) throw Error('--max must be between 1 and 1000');
const stat=statSync(backup);
const h=createHash('sha256');
for await(const c of createReadStream(backup)) h.update(c);
const sha=h.digest('hex');
const dburl=process.env.DATABASE_URL;
if (!dburl) throw Error('DATABASE_URL missing');
const parsed=new URL(dburl);
validateOptions({mode,backupAgeMs:Date.now()-stat.mtimeMs,backupBytes:stat.size,host:parsed.hostname,
  acknowledged: process.env.DBK82_PRODUCTION_AUDIT_READS_CONFIRMED==='YES',confirm:getFlag('--commit='),backupSha:expectedSha?.toLowerCase(),actualSha:sha});
const project=process.env.NEXT_PUBLIC_SANITY_PROJECT_ID||process.env.SANITY_PROJECT_ID;
const dataset=process.env.NEXT_PUBLIC_SANITY_DATASET||process.env.SANITY_DATASET;
const token=process.env.SANITY_API_WRITE_TOKEN;
if (project!=='g34n810u' || dataset!=='production' || !token) throw Error('Expected production Sanity project/dataset and write token');
const sanity=`https://${project}.api.sanity.io/v2025-02-19`;
const fetchSanity=async (url,init={})=>{
  const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${token}`,...init.headers},cache:'no-store'});
  if (!r.ok) throw Error(`Sanity HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
  return await r.json();
};
// Compare against a fresh source snapshot; only exact SAME live revision is eligible.
const extractor=join(dirname(fileURLToPath(import.meta.url)),'dbk46_extract.py');
if (!existsSync(extractor)) throw Error('Copy scripts/dbk46_extract.py from this repository before running');
const cp=spawn('python3',[extractor,backup],{stdio:['ignore','pipe','pipe']});
let err='';cp.stderr.setEncoding('utf8');cp.stderr.on('data',t=>err+=t);
const finished=new Promise((resolve,reject)=>{cp.once('close',resolve);cp.once('error',reject);});
const snapshots=new Map();
for await(const line of createInterface({input:cp.stdout,crlfDelay:Infinity})){
  const d=JSON.parse(line);
  if(d._type!=='auditEvent')continue;
  if(snapshots.has(d._id))throw Error('Backup has duplicate audit ID');
  snapshots.set(d._id,d);
  if(snapshots.size>25000)throw Error('Unexpected snapshot volume');
}
if((await finished)!==0)throw Error(`Sanity export extraction failed: ${err.slice(0,200)}`);
if(snapshots.size===0)throw Error('No audit events found in fresh backup');
const live=new Map();let cursor='';
for(let p=0;p<50;p++){
  const u=new URL(`${sanity}/data/query/${dataset}`);
  u.searchParams.set('query',`*[_type == "auditEvent" && _id > $cursor] | order(_id asc)[0...750]{_id,_rev,_createdAt,_updatedAt,resolutionStatus}`);
  u.searchParams.set('$cursor',JSON.stringify(cursor));
  const res=await fetchSanity(u);
  if(!Array.isArray(res.result))throw Error('Invalid live Sanity audit query');
  if(!res.result.length)break;
  for(const d of res.result){if(live.has(d._id))throw Error('Repeated audit ID during live pagination');live.set(d._id,d);}
  cursor=res.result.at(-1)._id;
  if(res.result.length<750)break;
  if(p===49)throw Error('Audit pagination limit exceeded');
}
let eligible=[]; const reasons={};
const now=Date.now();
for(const d of snapshots.values()){
  const reason=candidate(d,live.get(d._id),now);
  if(reason) reasons[reason]=(reasons[reason]||0)+1; else eligible.push(d);
}

// Only immutable, old M-PESA audit events for delivered and paid orders.
const targetTypes = new Set([
  'POS_MPESA_PAYMENT_STARTED',
  'POS_MPESA_STK_SENT'
]);

async function loadStatuses(ids) {
  const result = new Map();
  for (let i=0; i<ids.length; i+=40) {
    const u=new URL(`${sanity}/data/query/${dataset}`);
    u.searchParams.set(
      'query',
      '*[_type == "commerceOrder" && _id in $ids]{_id,status,paymentStatus}'
    );
    u.searchParams.set('$ids',JSON.stringify(ids.slice(i,i+40)));
    const response=await fetchSanity(u);
    if(!Array.isArray(response.result))
      throw Error('Could not verify live order statuses');
    for(const order of response.result)
      result.set(order._id,order);
  }
  return result;
}

const ids=[...new Set(eligible
  .filter(d=>targetTypes.has(d.eventType) &&
    d.entityType==='commerceOrder' &&
    typeof d.entityId==='string')
  .map(d=>d.entityId))];

const orderStates=await loadStatuses(ids);
const approved=[];

for(const d of eligible) {
  if(!targetTypes.has(d.eventType)) {
    reasons.other_event_excluded=(reasons.other_event_excluded||0)+1;
    continue;
  }
  if(d.entityType!=='commerceOrder' || !d.entityId) {
    reasons.no_linked_order=(reasons.no_linked_order||0)+1;
    continue;
  }
  const order=orderStates.get(d.entityId);
  if(order?.status!=='delivered' || order?.paymentStatus!=='paid') {
    reasons.not_delivered_and_paid=(reasons.not_delivered_and_paid||0)+1;
    continue;
  }
  approved.push(d);
}
eligible=approved;

// Fail-closed sanity: a large count mismatch suggests wrong export or stale search index.
if(live.size<Math.floor(snapshots.size*0.9))throw Error('Unexpected missing live audit documents, STOP');
const {neon}=await import('@neondatabase/serverless');
const sql=neon(dburl);
const [db]=await sql`SELECT current_database() AS name,pg_database_size(current_database())::bigint AS bytes,
 to_regclass('public.dbk_sanity_operational_archive')::text AS archive_table`;
if(db.name!=='neondb' || !db.archive_table || Number(db.bytes)>=800*1024*1024)throw Error('Wrong Neon database, archive missing or nearing 800MiB');
async function getArchive(){
  const rows=await sql`SELECT document_type,sanity_id,source_revision,source_sha256 FROM public.dbk_sanity_operational_archive WHERE document_type='auditEvent'`;
  return new Map(rows.map(r=>[r.sanity_id,r]));
}
let archived=await getArchive();
const matched=eligible.filter(d=>verifiedArchive(d,archived.get(d._id)));
const pending=eligible.filter(d=>!verifiedArchive(d,archived.get(d._id)));
const summary={stage:'DBK-86',mode,sourceBackupSha256:sha,backupAuditEvents:snapshots.size,liveAuditEvents:live.size,
  eligibleOlderThan72Hours:eligible.length,skipped:reasons,alreadyArchivedExact:matched.length,
  needsArchive:pending.length,neonArchiveTotal:archived.size,estimatedMaxReduction:eligible.length,
  warning:'Only auditEvent; never delete inventoryMovement or other commercial records with this tool.'};
if(mode==='plan'){
  console.log(JSON.stringify({...summary,results:'READ ONLY — zero writes or deletions'},null,2));
  process.exit(0);
}
if(mode==='archive'){
  let updated=0;
  for(let i=0;i<pending.length;i+=50){
    const rows=pending.slice(i,i+50).map(d=>({document_type:'auditEvent',sanity_id:d._id,source_revision:d._rev,
      source_created_at:d._createdAt,source_updated_at:d._updatedAt,source_sha256:fingerprint(d),document_json:d}));
    const json=JSON.stringify(rows);
    await sql`INSERT INTO public.dbk_sanity_operational_archive
      (document_type,sanity_id,source_revision,source_created_at,source_updated_at,source_sha256,document_json)
      SELECT x.document_type,x.sanity_id,x.source_revision,x.source_created_at,x.source_updated_at,x.source_sha256,x.document_json
      FROM jsonb_to_recordset(${json}::jsonb) AS x
      (document_type text,sanity_id text,source_revision text,source_created_at timestamptz,source_updated_at timestamptz,source_sha256 text,document_json jsonb)
      ON CONFLICT (document_type,sanity_id) DO UPDATE SET
      source_revision=EXCLUDED.source_revision,source_created_at=EXCLUDED.source_created_at,
      source_updated_at=EXCLUDED.source_updated_at,source_sha256=EXCLUDED.source_sha256,
      document_json=EXCLUDED.document_json`;
    updated+=rows.length;
  }
  archived=await getArchive();
  const missing=eligible.filter(d=>!verifiedArchive(d,archived.get(d._id)));
  if(missing.length)throw Error(`Neon archive verification failed for ${missing.length} docs. No Sanity deletions performed.`);
  console.log(JSON.stringify({...summary,mode:'NEON_ARCHIVE_ONLY',archivedOrUpdated:updated,
    fullyVerified:eligible.length,originalSanityDocumentsDeleted:0,
    next:'Verify deployed audit historical reads before running separate retirement command'},null,2));
  process.exit(0);
}
if(mode==='retire' &&
   process.env.DBK86_PRODUCTION_AUDIT_UI_VERIFIED!=='YES')
  throw Error('Production archived audit UI verification required');

// Production retirement: immutable rows only; archive proofs + live revision check + manual reader acknowledgement.
const unarchived=eligible.filter(d=>!verifiedArchive(d,archived.get(d._id)));
if(unarchived.length)throw Error(`STOP: ${unarchived.length} eligible audit events are not precisely archived; run --archive first`);
// Fresh live revision check before every deletion; deletion itself also uses optimistic locking.
let deleted=0, stopped=false;
const bounded=eligible.sort((a,b)=>a._id.localeCompare(b._id)).slice(0,Number(maxArg));
for(let i=0;i<bounded.length;i+=25){
  const batch=bounded.slice(i,i+25);
  const current=await loadStatuses(
    [...new Set(batch.map(d=>d.entityId))]
  );
  if(batch.some(d=>
    current.get(d.entityId)?.status!=='delivered' ||
    current.get(d.entityId)?.paymentStatus!=='paid'
  )) throw Error('Order state changed; stopping deletion');
  const res=await fetchSanity(`${sanity}/data/mutate/${dataset}?returnIds=true`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({mutations:batch.map(d=>({delete:{id:d._id,ifRevisionID:d._rev}}))}),
  });
  if(!Array.isArray(res.results) || res.results.length!==batch.length)throw Error(`Mutation response count mismatch after ${deleted} deletes. STOP and verify`);
  deleted+=batch.length;
  console.error(`DBK-82 safely retired ${deleted}/${bounded.length} verified archive rows`);
}
console.log(JSON.stringify({...summary,mode:'SANITY_VERIFIED_AUDIT_RETIREMENT',deletedThisRun:deleted,
  approximateRemainingSanityAuditDocs:live.size-deleted,
  note:'Archive kept in Neon. Re-export backup before further retirement runs. Never rerun with a stale export.'},null,2));
