#!/usr/bin/env node
/* Copy-only migration of inventoryMovement from fresh Sanity backup into Neon DBK-82 archive.
   Does NOT delete Sanity documents or alter inventory, payments, orders, or staff activity. */
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fingerprint,PINNED_HOST} from './dbk82_core.mjs';
const args=process.argv.slice(2);
const backup=args.find(a=>!a.startsWith('--'));
const shaFlag=args.find(a=>a.startsWith('--backup-sha256='))?.split('=')[1];
const apply=args.includes('--archive');
if(!backup||!existsSync(backup)||!shaFlag||!/^[a-f0-9]{64}$/i.test(shaFlag)||args.some(a=>a.startsWith('--') && a!=='--archive' && !a.startsWith('--backup-sha256='))) {
  throw Error('Usage: node scripts/dbk82_archive_movements.mjs /fresh/production.tar.gz --backup-sha256=SHA [--archive]');
}
const s=statSync(backup);if(Date.now()-s.mtimeMs>2*3600000||s.size<100000)throw Error('Fresh backup (under 2h) required');
const h=createHash('sha256');for await(const c of createReadStream(backup))h.update(c);
const sha=h.digest('hex');if(shaFlag.toLowerCase()!==sha)throw Error('Backup SHA mismatch');
const dburl=process.env.DATABASE_URL;
if(!dburl||new URL(dburl).hostname!==PINNED_HOST)throw Error('Pinned production Neon URL required');
const project=process.env.NEXT_PUBLIC_SANITY_PROJECT_ID||process.env.SANITY_PROJECT_ID;
const dataset=process.env.NEXT_PUBLIC_SANITY_DATASET||process.env.SANITY_DATASET;
const token=process.env.SANITY_API_WRITE_TOKEN;
if(project!=='g34n810u'||dataset!=='production'||!token)throw Error('Expected Sanity production configuration');
const extractor=join(dirname(fileURLToPath(import.meta.url)),'dbk82_extract_movements.py');
const proc=spawn('python3',[extractor,backup],{stdio:['ignore','pipe','pipe']});
let errors='';proc.stderr.setEncoding('utf8');proc.stderr.on('data',x=>errors+=x);
const exit=new Promise((resolve,reject)=>{proc.on('close',resolve);proc.on('error',reject)});
const docs=new Map();for await(const l of createInterface({input:proc.stdout,crlfDelay:Infinity})){
  const d=JSON.parse(l);if(docs.has(d._id))throw Error('Duplicate movement ID in snapshot');
  docs.set(d._id,d);if(docs.size>30000)throw Error('Unexpected record volume');
}
if(await exit!==0)throw Error('Backup movement extraction failed: '+errors.slice(0,150));
if(docs.size===0)throw Error('Empty movement snapshot');
const fetchGROQ=async(q,params={})=>{
  const u=new URL(`https://${project}.api.sanity.io/v2025-02-19/data/query/${dataset}`);
  u.searchParams.set('query',q);
  for(const[k,v]of Object.entries(params))u.searchParams.set('$'+k,JSON.stringify(v));
  const r=await fetch(u,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  if(!r.ok)throw Error('Sanity HTTP '+r.status);
  return (await r.json()).result;
};
const current=new Map();let last='';
for(let p=0;p<60;p++){
  const arr=await fetchGROQ(`*[_type=="inventoryMovement" && _id>$last] | order(_id asc)[0...750]{_id,_rev}`,{last});
  if(!Array.isArray(arr))throw Error('Invalid Sanity response');
  if(!arr.length)break;
  for(const d of arr)current.set(d._id,d._rev);
  last=arr.at(-1)._id;
  if(arr.length<750)break;
  if(p===59)throw Error('Movement list truncated');
}
const eligible=[...docs.values()].filter(d=>current.get(d._id)===d._rev);
const {neon}=await import('@neondatabase/serverless');const sql=neon(dburl);
const db=await sql`SELECT current_database() AS name,to_regclass('public.dbk82_inventory_movement_archive')::text AS tbl,pg_database_size(current_database())::bigint AS bytes`;
if(db[0]?.name!=='neondb'||!db[0]?.tbl||Number(db[0].bytes)>=800*1024*1024)throw Error('Run DBK82 SQL in pinned Neon production, or database too large');
const dbrows=await sql`SELECT sanity_id,source_revision,source_sha256 FROM public.dbk82_inventory_movement_archive`;
let archive=new Map(dbrows.map(r=>[r.sanity_id,r]));
const missing=eligible.filter(d=>archive.get(d._id)?.source_revision!==d._rev || archive.get(d._id)?.source_sha256!==fingerprint(d));
const counts={stage:'DBK-82',mode:apply?'NEON_MOVEMENT_ARCHIVE_ONLY':'READ_ONLY',snapshotMovements:docs.size,liveMovements:current.size,liveRevisionMatched:eligible.length,alreadyArchivedVerified:eligible.length-missing.length,toCopyOrUpdate:missing.length,sourceBackupSha256:sha};
if(!apply){console.log(JSON.stringify({...counts,sanityDeleted:0},null,2));process.exit(0)}
let written=0;
for(let i=0;i<missing.length;i+=50){
  const rows=missing.slice(i,i+50).map(d=>({sanity_id:d._id,source_revision:d._rev,source_sha256:fingerprint(d),source_created_at:d._createdAt,source_updated_at:d._updatedAt,document_json:d}));
  const payload=JSON.stringify(rows);
  await sql`INSERT INTO public.dbk82_inventory_movement_archive (sanity_id,source_revision,source_sha256,source_created_at,source_updated_at,document_json)
    SELECT x.sanity_id,x.source_revision,x.source_sha256,x.source_created_at,x.source_updated_at,x.document_json
    FROM jsonb_to_recordset(${payload}::jsonb) AS x
    (sanity_id text,source_revision text,source_sha256 text,source_created_at timestamptz,source_updated_at timestamptz,document_json jsonb)
    ON CONFLICT(sanity_id) DO UPDATE SET source_revision=EXCLUDED.source_revision,source_sha256=EXCLUDED.source_sha256,
      source_created_at=EXCLUDED.source_created_at,source_updated_at=EXCLUDED.source_updated_at,
      document_json=EXCLUDED.document_json,archived_at=now()`;
  written+=rows.length;
}
const check=await sql`SELECT sanity_id,source_revision,source_sha256 FROM public.dbk82_inventory_movement_archive`;
archive=new Map(check.map(r=>[r.sanity_id,r]));
const bad=eligible.filter(d=>archive.get(d._id)?.source_revision!==d._rev || archive.get(d._id)?.source_sha256!==fingerprint(d));
if(bad.length)throw Error(`Movement archive verification failed for ${bad.length}`);
console.log(JSON.stringify({...counts,written,verifiedInNeon:eligible.length,sanityDeleted:0,
  warning:'DO NOT DELETE inventoryMovement from Sanity. Current stock movement history and correction routes still need it.'},null,2));
