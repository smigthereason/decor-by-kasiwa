#!/usr/bin/env node
// DBK-95: Sanity validates create(order)+patch(order) atomically, NO writes.
// Uses official ?dryRun=true, checks that no probe document was persisted.
import {randomUUID,createHash} from 'node:crypto';
const project=process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset=process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const token=process.env.SANITY_API_WRITE_TOKEN;
if(project!=='g34n810u' || dataset!=='production' || !token)
  throw new Error('Expected Decor By Kasiwa production dataset and Sanity token');
const id=`commerceOrder.dbk95-dryrun-${randomUUID()}`;
const hash=createHash('sha256').update(id).digest('hex').slice(0,24);
const journal={
  _key:hash,_type:'dbk95AuditEntry',key:`dbk95-dryrun|${id}`,
  auditId:`auditEvent.${hash}`,eventNumber:`AUD-${hash.slice(0,12).toUpperCase()}`,
  eventType:'DBK95_DRY_RUN_ONLY',entityType:'commerceOrder',entityId:id,
  entityLabel:'NOT A REAL ORDER',detail:'No writes should occur',createdAt:new Date().toISOString(),
};
const base=`https://${project}.api.sanity.io/v2025-02-19`;
const response=await fetch(`${base}/data/mutate/${dataset}?dryRun=true&returnDocuments=true`,{
  method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
  body:JSON.stringify({mutations:[
    {create:{_id:id,_type:'commerceOrder',orderNumber:'DBK95-DRYRUN-ONLY'}},
    {patch:{id,setIfMissing:{dbk95AuditJournal:[]},insert:{after:'dbk95AuditJournal[-1]',items:[journal]}}},
  ]}),
});
const payload=await response.json();
if(!response.ok) {
  console.error(JSON.stringify({status:response.status,error:payload?.error?.description || payload?.error || 'unknown'}));
  throw new Error('Sanity rejected create+patch in the same transaction; STOP DBK-95 activation');
}
if(!Array.isArray(payload.results) || payload.results.length!==2)
  throw new Error('Unexpected Sanity dry-run mutation response; STOP');
const check=new URL(`${base}/data/query/${dataset}`);
check.searchParams.set('query','count(*[_id==$id])');
check.searchParams.set('$id',JSON.stringify(id));
const query=await fetch(check,{headers:{Authorization:`Bearer ${token}`}});
if(!query.ok)throw new Error('Cannot verify dry-run left no persisted document');
const value=await query.json();
if(value.result!==0)throw new Error('Dry-run probe unexpectedly persisted; STOP');
console.log(JSON.stringify({stage:'DBK-95',mode:'SANITY_TRANSACTION_DRY_RUN',
  createThenPatchAccepted:true,persistedProbeDocuments:0},null,2));
