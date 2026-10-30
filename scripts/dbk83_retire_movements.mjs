#!/usr/bin/env node
/* DBK-83: Delayed/guarded movement retirement. ALWAYS run dry-run and verify
   deployed hybrid readers and restored corrections first. Does not modify stock. */
import {createHash} from 'node:crypto';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {retirementCandidate,requireCommitAuthorization,APPROVAL} from './dbk83_retirement_core.mjs';
const args=process.argv.slice(2);
const backup=args.find(a=>!a.startsWith('--'));
const arg=p=>args.find(a=>a.startsWith(p))?.slice(p.length);
const expectedSha=arg('--backup-sha256=');const confirm=arg('--commit=');
const limitArg=arg('--max=')||'250';
const write=Boolean(confirm);
if(!backup||!existsSync(backup)||!/^[0-9a-f]{64}$/.test(expectedSha||'')||
  !/^\d+$/.test(limitArg)||Number(limitArg)<1||Number(limitArg)>250||
  args.some(a=>a.startsWith('--')&&!a.startsWith('--backup-sha256=')&&!a.startsWith('--max=')&&!a.startsWith('--commit='))||
  (write&&confirm!==APPROVAL))throw Error('Usage: node scripts/dbk83_retire_movements.mjs /fresh/backup.tar.gz --backup-sha256=SHA [--commit=RETIRE_DBK83_VERIFIED_HISTORIC_MOVEMENTS --max=250]');
const stats=statSync(backup), h=createHash('sha256');
for await(const part of createReadStream(backup))h.update(part);
const actualSha=h.digest('hex');
const dburl=process.env.DATABASE_URL;
if(!dburl)throw Error('DATABASE_URL missing');
requireCommitAuthorization({requested:write,flags:{
  reads:process.env.DBK83_PRODUCTION_READS_VERIFIED==='YES',
  restore:process.env.DBK83_RESTORE_FOR_CORRECTION_VERIFIED==='YES',
  approval:process.env.DBK83_MOVEMENT_RETIRE_APPROVED==='YES' && process.env.DBK83_FULL_REPOSITORY_REFERENCES_REVIEWED==='YES',
},host:new URL(dburl).hostname,age:Date.now()-stats.mtimeMs,bytes:stats.size,expectedSha,actualSha});
const project=process.env.NEXT_PUBLIC_SANITY_PROJECT_ID||process.env.SANITY_PROJECT_ID;
const dataset=process.env.NEXT_PUBLIC_SANITY_DATASET||process.env.SANITY_DATASET;
const token=process.env.SANITY_API_WRITE_TOKEN;
if(project!=='g34n810u'||dataset!=='production'||!token)throw Error('Expected Sanity production account');
const extractor=join(dirname(fileURLToPath(import.meta.url)),'dbk83_extract_movements.py');
const child=spawn('python3',[extractor,backup],{stdio:['ignore','pipe','pipe']});
let stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',v=>stderr+=v);
const finish=new Promise((resolve,reject)=>{child.once('close',resolve);child.once('error',reject)});
const snapshot=new Map();
for await(const line of createInterface({input:child.stdout,crlfDelay:Infinity})){
 const d=JSON.parse(line);if(snapshot.has(d._id))throw Error('Duplicate archived movement in snapshot');snapshot.set(d._id,d);
 if(snapshot.size>30000)throw Error('Unexpected movement volume');
}
if(await finish!==0||!snapshot.size)throw Error('Movement extraction failed: '+stderr.slice(0,100));
async function sanity(endpoint,body){
  const url=`https://${project}.api.sanity.io/v2025-02-19/data/${endpoint}/${dataset}`;
  const options=body?{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(body)}:{headers:{Authorization:`Bearer ${token}`}};
  const res=await fetch(url,options);if(!res.ok)throw Error('Sanity error '+res.status+': '+(await res.text()).slice(0,250));return res.json();
}
const live=new Map();let last='';
for(let p=0;p<70;p++){
 const query=`*[_type == "inventoryMovement" && _id > $last] | order(_id asc)[0...750]{_id,_rev}`;
 const url=new URL(`https://${project}.api.sanity.io/v2025-02-19/data/query/${dataset}`);
 url.searchParams.set('query',query);url.searchParams.set('$last',JSON.stringify(last));
 const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
 if(!response.ok)throw Error('Sanity live list request rejected '+response.status);
 const arr=(await response.json()).result;if(!Array.isArray(arr))throw Error('Malformed Sanity response');
 for(const row of arr)live.set(row._id,row);if(!arr.length||arr.length<750)break;
 last=arr.at(-1)._id;if(p===69)throw Error('Live inventory list may be truncated');
}
const {neon}=await import('@neondatabase/serverless');const sql=neon(dburl);
const archiveRows=await sql`SELECT sanity_id,source_revision,source_sha256 FROM public.dbk82_inventory_movement_archive`;
const archives=new Map(archiveRows.map(r=>[r.sanity_id,r]));
const now=Date.now();let skipped={};let eligible=[];
for(const doc of snapshot.values()){
 const why=retirementCandidate(doc,live.get(doc._id),archives.get(doc._id),now);
 if(why)skipped[why]=(skipped[why]||0)+1;else eligible.push(doc);
}
eligible.sort((a,b)=>a._id.localeCompare(b._id));
const report={stage:'DBK-83',mode:write?'RETIRE_VERIFIED_MOVEMENTS':'READ_ONLY_PLAN',
  snapshotMovements:snapshot.size,liveMovements:live.size,neonArchivedMovements:archives.size,
  eligibleOlderThan7Days:eligible.length,skipped,requestedMax:Number(limitArg),
  sourceBackupSha256:actualSha};
if(!write){console.log(JSON.stringify({...report,sanityDeleted:0,warning:'Requires verified production UI and restore workflow before any deletion'},null,2));process.exit(0)}
const bounded=eligible.slice(0,Number(limitArg));let retired=0;
for(let i=0;i<bounded.length;i+=25){
 const batch=bounded.slice(i,i+25);
 const result=await sanity('mutate',{mutations:batch.map(d=>({delete:{id:d._id,ifRevisionID:d._rev}}))});
 if(!Array.isArray(result.results)||result.results.length!==batch.length)throw Error('Sanity deletion result mismatch. STOP');
 retired+=batch.length;console.error('DBK-83 retired '+retired+' verified historical movements');
}
console.log(JSON.stringify({...report,deletedThisRun:retired,warning:'Refresh backup and verify UI after each batch. This does not modify stock balances.'},null,2));
