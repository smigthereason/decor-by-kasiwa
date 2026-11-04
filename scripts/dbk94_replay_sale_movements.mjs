#!/usr/bin/env node
// DBK-94 operator recovery worker. Run with production env, --audit for
// read-only count; --project requires explicit operator acknowledgement.
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { createClient } from '@sanity/client';
const mode=process.argv.includes('--project')?'project':'audit';
if (mode==='project' && process.env.DBK94_NEON_PROJECTOR_APPROVED!=='YES')
  throw new Error('Projector write acknowledgement missing');
const connection=process.env.DATABASE_URL || '';
const url=new URL(connection);
if (url.hostname!=='ep-steep-scene-bausr4ct-pooler.c-8.eu-central-1.aws.neon.tech' || url.pathname!=='/neondb')
  throw new Error('DBK-94 only supports production Neon');
if (process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!=='g34n810u' ||
    (process.env.NEXT_PUBLIC_SANITY_DATASET||'production')!=='production')
  throw new Error('DBK-94 Sanity project mismatch');
const sql=neon(connection);
const sanity=createClient({projectId:'g34n810u',dataset:'production',
  apiVersion:'2026-08-27',useCdn:false,token:process.env.SANITY_API_WRITE_TOKEN});
let cursor='',scanned=0,projected=0,unmatched=0,failed=false;
const seen=new Set();
for(let page=0;page<100;page++) {
  const orders=await sanity.fetch(`*[_type=='commerceOrder' && _id>$cursor && defined(dbk94SaleMovementJournal[0])]
    | order(_id asc)[0...100]{_id,dbk94SaleMovementJournal}`,{cursor});
  if(!orders.length)break;
  for(const order of orders){
    scanned++;
    for(const entry of order.dbk94SaleMovementJournal||[]) {
      if(!entry.movementId?.startsWith('inventoryMovement.') || entry.orderId!==order._id ||
         seen.has(entry.movementId))throw new Error('Duplicate or invalid DBK-94 journal');
      seen.add(entry.movementId);
      const payload=JSON.stringify(entry);
      const sha=createHash('sha256').update(payload).digest('hex');
      if(mode==='project'){
        await sql`INSERT INTO public.dbk94_sale_movements
          (movement_id,order_id,entry_sha256,movement_json)
          VALUES (${entry.movementId},${order._id},${sha},${payload}::jsonb)
          ON CONFLICT (movement_id) DO NOTHING`;
      }
      const rows=await sql`SELECT order_id,entry_sha256 FROM public.dbk94_sale_movements
          WHERE movement_id=${entry.movementId}`;
      if(rows.length===1 && rows[0].order_id===order._id && rows[0].entry_sha256===sha)projected++;
      else {unmatched++;failed=true;}
    }
  }
  cursor=orders.at(-1)._id;
  if(orders.length<100)break;
  if(page===99)throw new Error('Exceeded DBK-94 journal pagination safety bound');
}
console.log(JSON.stringify({stage:'DBK-94',mode,ordersWithJournal:scanned,
  expectedMovements:seen.size,neonMatchingMovements:projected,unmatched},null,2));
if(failed)process.exitCode=2;
