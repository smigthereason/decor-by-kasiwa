#!/usr/bin/env node
// TEST BRANCH ONLY: destructive operations on disposable fixture rows.
// Never run on production; resets write gate to OFF in finally.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {neon} from '@neondatabase/serverless';
const url=process.env.DATABASE_URL && new URL(process.env.DATABASE_URL);
const expected=process.env.DBK51_EXPECTED_TEST_HOST, prod=process.env.DBK51_PRODUCTION_HOST;
if(!url || !expected || !prod || expected===prod || url.hostname!==expected || url.hostname===prod || process.env.DBK51_TEST_WRITE!=='YES') {
  throw new Error('REFUSING: must use isolated Neon TEST branch with explicit DBK51_TEST_WRITE=YES');
}
const sql=neon(process.env.DATABASE_URL);
const suffix=randomUUID().replaceAll('-','');
const p1=`dbk54-fixture-one-${suffix}`;
const p2=`dbk54-fixture-two-${suffix}`;
const store=`dbk54-store-${suffix}`;
const saleBatch=`dbk54-smoke-${suffix}-sale`;
const mk=(batchId,orderId,items,type='SALE')=> sql`SELECT public.dbk54_apply_stock_batch(${batchId},${JSON.stringify({type,orderId,items})}::jsonb) AS result`;
const line=(productId,quantity)=>({productId,variantId:'',quantity,sourceStoreId:store});
let testStarted=false;
try {
  const meta=await sql`SELECT writes_enabled,seed_fingerprint FROM public.dbk51_stock_engine_config WHERE singleton`;
  if(!meta[0]?.seed_fingerprint || meta[0]?.writes_enabled) throw new Error('DBK-51 test seed required, write gate must start OFF');
  const funcs=await sql`SELECT to_regclass('public.dbk54_stock_batches')::text AS batch_table`;
  if(!funcs[0]?.batch_table) throw new Error('Apply migration/dbk54/atomic-basket.sql in Neon TEST branch');
  testStarted=true;
  await sql`INSERT INTO public.dbk51_stock_balances
    (product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint)
    VALUES (${p1},'',${store},5,0,'fixture','fixture',${meta[0].seed_fingerprint}),
           (${p2},'',${store},2,0,'fixture','fixture',${meta[0].seed_fingerprint})`;
  await assert.rejects(mk(`${saleBatch}-gate`,`dbk54-order-${suffix}-gate`,[line(p1,1)]),/write gate is disabled/);
  await sql`UPDATE public.dbk51_stock_engine_config SET writes_enabled=true,updated_at=now() WHERE singleton`;
  const order=`dbk54-order-${suffix}-1`;
  const lines=[line(p1,1),line(p2,1)];
  const first=await mk(saleBatch,order,lines);
  assert.equal(first[0].result.lineCount,2);
  const replay=await mk(saleBatch,order,lines);
  assert.equal(replay[0].result.replayed,true);
  await assert.rejects(mk(saleBatch,order,[line(p1,2),line(p2,1)]),/changed payload/);
  await assert.rejects(mk(`${saleBatch}-alternate`,order,lines),/already been deducted/);
  const before=await sql`SELECT product_id,on_hand FROM public.dbk51_stock_balances
    WHERE product_id IN (${p1},${p2}) ORDER BY product_id`;
  await assert.rejects(mk(`${saleBatch}-rollback`,`dbk54-order-${suffix}-bad`,[line(p1,1),line(p2,99)]),/Insufficient stock/);
  const after=await sql`SELECT product_id,on_hand FROM public.dbk51_stock_balances
    WHERE product_id IN (${p1},${p2}) ORDER BY product_id`;
  assert.deepEqual(after,before,'Partial stock deduction escaped failed PostgreSQL transaction');
  const attempts=await Promise.allSettled(Array.from({length:6},(_,i)=>
    mk(`${saleBatch}-concurrent-${i}`,`dbk54-order-${suffix}-concurrent-${i}`,[line(p1,1)])));
  const succeeded=attempts.filter(v=>v.status==='fulfilled').length;
  const insufficient=attempts.filter(v=>v.status==='rejected').length;
  assert.equal(succeeded,4); assert.equal(insufficient,2);
  const refundId=`dbk54-smoke-${suffix}-refund`;
  const returnLine={productId:p1,variantId:'',quantity:1,destinationStoreId:store};
  await mk(refundId,order,[returnLine],'RETURN');
  const refundReplay=await mk(refundId,order,[returnLine],'RETURN');
  assert.equal(refundReplay[0].result.replayed,true);
  await assert.rejects(
    mk(`${refundId}-overreturn`,order,[{...returnLine,quantity:1}],'RETURN'),
    /Return quantity exceeds sold quantity/);
  await assert.rejects(
    mk(`${refundId}-unregistered`,`dbk54-order-${suffix}-unknown`,[returnLine],'RETURN'),
    /unregistered Neon sale/);
  const last=await sql`SELECT product_id,on_hand FROM public.dbk51_stock_balances
    WHERE product_id IN (${p1},${p2}) ORDER BY product_id`;
  assert.equal(Number(last.find(v=>v.product_id===p1).on_hand),1);
  assert.equal(Number(last.find(v=>v.product_id===p2).on_hand),1);
  const counts=await sql`SELECT
   (SELECT count(*)::int FROM public.dbk54_stock_batches WHERE batch_id LIKE ${`dbk54-smoke-${suffix}%`}) AS batches,
   (SELECT count(*)::int FROM public.dbk51_stock_operations WHERE product_id IN (${p1},${p2})) AS ops`;
  console.log(JSON.stringify({stage:'DBK-54',result:'ISOLATED TEST PASS',
    multiItemSuccess:true,idempotentReplay:true,changedPayloadRejected:true,
    duplicateOrderRejected:true,partialBatchRolledBack:true,
    concurrentSuccesses:succeeded,concurrentStockRejections:insufficient,
    refundIdempotent:true,balances:last,counts:counts[0]},null,2));
} finally {
  if(testStarted){
    await sql`UPDATE public.dbk51_stock_engine_config SET writes_enabled=false,updated_at=now() WHERE singleton`;
    console.log('TEST branch write gate disabled.');
  }
  if(testStarted){
    await sql`DELETE FROM public.dbk54_stock_batches WHERE batch_id LIKE ${`dbk54-smoke-${suffix}%`}`;
    await sql`DELETE FROM public.dbk51_stock_operations WHERE product_id IN (${p1},${p2})`;
    await sql`DELETE FROM public.dbk51_stock_balances WHERE product_id IN (${p1},${p2})`;
    console.log('TEST fixture rows removed.');
  }
}
