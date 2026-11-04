#!/usr/bin/env node
// DBK-95 recovery: read-only by default, --project only with operator approval.
import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {createClient} from '@sanity/client';
const mode=process.argv.includes('--project')?'project':'audit';
if (process.argv.some(a=>a.startsWith('--') && !['--project','--audit'].includes(a)))
  throw new Error('Unknown DBK-95 flag');
if(mode==='project' && process.env.DBK95_AUDIT_PROJECTOR_APPROVED!=='YES')
  throw new Error('Explicit DBK-95 audit projector approval required');
const raw=process.env.DATABASE_URL||'';
const db=new URL(raw);
if(db.hostname!=='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech' || db.pathname!=='/neondb' ||
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!=='g34n810u' ||
    process.env.NEXT_PUBLIC_SANITY_DATASET!=='production')
  throw new Error('DBK-95 requires pinned production Sanity and Neon');
const sql=neon(raw);
const sanity=createClient({projectId:'g34n810u',dataset:'production',apiVersion:'2026-08-27',useCdn:false,
  token:process.env.SANITY_API_WRITE_TOKEN});
const sha=v=>createHash('sha256').update(v).digest('hex');
let cursor='',ordersWithJournal=0,expected=0,matched=0,unmatched=0;
const unique=new Map();
for(let i=0;i<100;i++){
  const orders=await sanity.fetch(`*[_type=='commerceOrder' && _id>$cursor && defined(dbk95AuditJournal[0])]
    | order(_id asc)[0...100]{_id,dbk95AuditJournal}`,{cursor});
  if(!orders.length) break;
  for(const order of orders){
    ordersWithJournal++;
    if((order.dbk95AuditJournal||[]).length>200)throw new Error('Too many audit events on order');
    for(const item of order.dbk95AuditJournal){
      if(item.entityId!==order._id || !item.key || !item.auditId ||
         !item.eventType || !Number.isFinite(Date.parse(item.createdAt)) ||
         !item.auditId.startsWith('auditEvent.') ||
         (item.key.startsWith('online|')
           ? !item.auditId.startsWith('auditEvent.online-')
           : item.auditId!==`auditEvent.${sha(item.key).slice(0,24)}`))
        throw new Error('DBK-95 invalid audit journal entry');
      const hash=sha(JSON.stringify([item.eventType,item.entityType,item.entityId,item.entityLabel,
        item.actorId||'',item.actorName||'',item.actorRole||'',item.detail]));
      if(unique.has(item.auditId)) {
        if(unique.get(item.auditId)!==hash)throw new Error('DBK-95 conflicting duplicate audit');
        continue;
      }
      unique.set(item.auditId,hash);
      expected++;
      const doc={_id:item.auditId,_type:'auditEvent',eventNumber:item.eventNumber,
        eventType:item.eventType,entityType:item.entityType,entityId:item.entityId,entityLabel:item.entityLabel,
        ...(item.actorId ? {actor:{_type:'reference',_ref:item.actorId}}:{}),
        ...(item.actorName ? {actorName:item.actorName}:{}),
        ...(item.actorRole ? {actorRole:item.actorRole}:{}),
        detail:item.detail,createdAt:item.createdAt};
      if(mode==='project'){
        await sql`INSERT INTO public.dbk_live_audit_events (id,payload_hash,document_json,created_at)
         VALUES (${item.auditId},${hash},${JSON.stringify(doc)}::jsonb,${item.createdAt}::timestamptz)
         ON CONFLICT (id) DO NOTHING`;
      }
      const rows=await sql`SELECT payload_hash FROM public.dbk_live_audit_events WHERE id=${item.auditId}`;
      if(rows.length===1 && rows[0].payload_hash===hash)matched++;
      else unmatched++;
    }
  }
  cursor=orders.at(-1)._id;
  if(orders.length<100)break;
  if(i===99)throw new Error('Exceeded DBK-95 pagination bound');
}
console.log(JSON.stringify({stage:'DBK-95',mode,ordersWithJournal,
  expectedAuditEvents:expected,neonMatchingAuditEvents:matched,unmatched},null,2));
if(unmatched)process.exitCode=2;
