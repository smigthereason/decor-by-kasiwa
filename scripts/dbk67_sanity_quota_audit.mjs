#!/usr/bin/env node
/* Read-only Sanity usage inventory. No mutation operations or tokens printed. */
const project=(process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_PROJECT_ID || '').trim();
const dataset=(process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_DATASET || 'production').trim();
const token=(process.env.SANITY_API_READ_TOKEN || process.env.SANITY_API_WRITE_TOKEN || '').trim();
if (!/^[a-z0-9-]{5,40}$/.test(project) || !/^[a-z0-9_-]{1,60}$/.test(dataset) || !token) {
  console.error('Missing Sanity project/dataset or read token; no requests made.');
  process.exit(1);
}
if (dataset!=='production') {
  console.error('Expected Sanity production dataset, refusing other dataset for quota estimate.');
  process.exit(1);
}
const types=['auditEvent','inventoryMovement','commerceOrder','paymentTransaction','shipment','inventoryRecord','product','customerUser','staffSession','clientError','expense','expenditure','restockRequest','stockAdjustment','orderCounter'];
const clauses=[`"total":count(*[])`,...types.map(t=>`"${t}":count(*[_type == "${t}"])`)];
const query=`{${clauses.join(',')}}`;
const url=new URL(`https://${project}.api.sanity.io/v2025-02-19/data/query/${dataset}`);
url.searchParams.set('query',query);
const response=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
if (!response.ok) {console.error(`Sanity returned HTTP ${response.status}`);process.exit(1)}
const data=(await response.json()).result;
if (!data || !Number.isInteger(data.total)) { console.error('Unexpected Sanity count response');process.exit(1); }
const used=data.total,limit=25_000;
console.log('SANITY QUOTA READ-ONLY AUDIT');
console.log(JSON.stringify({totalDocuments:used,remaining:Math.max(0,limit-used),usedPct:(100*used/limit).toFixed(1),counts:data},null,2));
if (used>=23000) {
  console.error('CAPACITY ALERT: >= 23,000 documents. Do not wait for migration to relieve quota. Run DBK-49 archived-audit preflight and review safely retired records; consider temporary restrictions on noncritical document creation.');
  process.exitCode=2;
}
