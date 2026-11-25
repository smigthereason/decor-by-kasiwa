import 'server-only';
import { getNeonSql } from '@/lib/db/neon';
import { dbk69InventoryEnabled, dbk69ProductBalances, requirePinnedInventoryDatabase } from './dbk69-inventory-neon';
import { validateAllocation, type AllocationRow } from './dbk151-allocation-core';
import { serverClient } from '@/sanity/lib/serverClient';

export type PendingAllocation = {id:string; keys:string[]; sellableKeys:string[]; available:boolean; posEnabled:boolean; ecommerceEnabled:boolean};
export function parsePending(value:unknown):PendingAllocation|null {
  if(value===undefined||value===null||value==='') return null;
  if(typeof value!=='string') throw new Error('Invalid pending variant conversion. Contact support.');
  const p=JSON.parse(value) as PendingAllocation;
  if(!/^dbk151-[0-9a-f-]{36}$/.test(p.id)||!Array.isArray(p.keys)||!Array.isArray(p.sellableKeys)||!p.keys.length||p.sellableKeys.some(k=>!p.keys.includes(k))||[p.available,p.posEnabled,p.ecommerceEnabled].some(v=>typeof v!=='boolean')) throw new Error('Invalid pending variant conversion. Contact support.');
  return p;
}
export async function allocationCommitted(productId:string, id:string):Promise<boolean> {
  requirePinnedInventoryDatabase();
  const [row]=await getNeonSql()`SELECT EXISTS(SELECT 1 FROM public.dbk151_variant_allocations WHERE operation_id=${id} AND product_id=${productId}) AS committed`;
  return row?.committed===true;
}
export async function allocationPlan(productId:string, pending:PendingAllocation, raw:unknown):Promise<AllocationRow[]> {
  if(!dbk69InventoryEnabled()||process.env.DBK69_INVENTORY_ADMIN!=='enabled') throw new Error('Neon inventory administration is disabled.');
  requirePinnedInventoryDatabase();
  const rows=await dbk69ProductBalances(productId);
  if(rows.some(r=>r.variant_id==='__UNALLOCATED_VARIANT__'&&(Number(r.on_hand)>0||Number(r.incoming)>0))) throw new Error('Quarantined variant stock requires reviewed reconciliation.');
  if(rows.some(r=>r.variant_id&&r.variant_id!=='__UNALLOCATED_VARIANT__'&&!pending.keys.includes(r.variant_id))) throw new Error('Retain all previously registered variant identifiers.');
  // No catalogue mutation if the migration is absent, or known financial work is outstanding.
  const [check]=await getNeonSql()`SELECT to_regprocedure('public.dbk151_allocate_variants(text,text,jsonb,jsonb,text)') IS NOT NULL AS installed,
    EXISTS(SELECT 1 FROM public.dbk51_stock_engine_config WHERE singleton AND writes_enabled AND seed_fingerprint IS NOT NULL) AND EXISTS(SELECT 1 FROM public.dbk69_inventory_config WHERE singleton AND enabled) AND NOT EXISTS(SELECT 1 FROM public.dbk74_freeze_control WHERE singleton AND active) AS ready,
    EXISTS(SELECT 1 FROM public.dbk64_online_orders o CROSS JOIN LATERAL jsonb_array_elements(o.snapshot->'lines') x WHERE (o.payment_status='PENDING' OR (o.payment_status='PAID' AND o.stock_status<>'COMMITTED')) AND x->>'productId'=${productId} AND coalesce(x->>'variantId','')='') OR
    EXISTS(SELECT 1 FROM public.dbk68_daraja_orders o CROSS JOIN LATERAL jsonb_array_elements(o.snapshot->'lines') x WHERE (o.payment_status IN ('CREATED','STARTING','PENDING') OR (o.payment_status='PAID' AND o.stock_status<>'COMMITTED')) AND x->>'productId'=${productId} AND coalesce(x->>'variantId','')='') OR
    EXISTS(SELECT 1 FROM public.dbk55_paid_pos_settlements o CROSS JOIN LATERAL jsonb_array_elements(o.source_payload->'items') x WHERE o.stock_status<>'COMMITTED' AND x->>'productId'=${productId} AND coalesce(x->>'variantId','')='') AS unresolved`;
  if(!check?.installed) throw new Error('Variant allocation database migration is not installed.');
  if(!check.ready) throw new Error('Inventory authority is not ready; no allocation can proceed.');
  if(check.unresolved) throw new Error('Resolve outstanding payment or stock settlement for this product before allocating its variants.');
  const plan=validateAllocation(rows.filter(r=>r.variant_id==='').map(r=>({locationId:r.location_id,onHand:Number(r.on_hand),incoming:Number(r.incoming)})),pending.keys,typeof raw==='string'?JSON.parse(raw):raw);
  if(plan.some(r=>!pending.sellableKeys.includes(r.variantId))) throw new Error('Allocate stock only to active variants.');
  return plan;
}
export async function finishAllocation(productId:string, revision:string, pending:PendingAllocation, raw:unknown, actorId:string) {
  requirePinnedInventoryDatabase();
  if(!dbk69InventoryEnabled()||process.env.DBK69_INVENTORY_ADMIN!=='enabled') throw new Error('Neon inventory administration is disabled.');
  const sql=getNeonSql();
  // A response can be lost after SQL commits. The durable operation ID allows
  // safe resume without applying stock twice, even after a browser refresh.
  const [prior]=await sql`SELECT product_id,variant_ids FROM public.dbk151_variant_allocations WHERE operation_id=${pending.id}`;
  if(prior){
    if(prior.product_id!==productId||JSON.stringify(prior.variant_ids)!==JSON.stringify(pending.keys)) throw new Error('Allocation identity mismatch. Contact support.');
  } else {
    const plan=await allocationPlan(productId,pending,raw);
    await sql`SELECT public.dbk151_allocate_variants(${pending.id},${productId},${JSON.stringify(pending.keys)}::jsonb,${JSON.stringify(plan)}::jsonb,${actorId})`;
  }
  // Only restore visibility after stock commit. A concurrent catalogue revision
  // is not overwritten: the pending marker stays for a subsequent safe retry.
  await serverClient.patch(productId).ifRevisionId(revision).set({available:pending.available,posEnabled:pending.posEnabled,ecommerceEnabled:pending.ecommerceEnabled,dbk151VariantAllocated:true}).unset(['dbk151Pending']).commit();
}
