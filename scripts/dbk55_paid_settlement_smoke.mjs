#!/usr/bin/env node
// DESTRUCTIVE ON DISPOSABLE FIXTURES. Strictly limited to isolated DBK-51 Neon TEST branch.
// Never execute against Neon production or a branch with production write traffic.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
const connection=process.env.DATABASE_URL;
const url=connection && new URL(connection);
const testHost=process.env.DBK51_EXPECTED_TEST_HOST;
const prodHost=process.env.DBK51_PRODUCTION_HOST;
if(!url || !testHost || !prodHost || testHost===prodHost || url.hostname!==testHost ||
   url.hostname===prodHost || process.env.DBK51_TEST_WRITE!=='YES') {
 throw new Error('REFUSING: DBK-55 requires an independently verified isolated Neon TEST branch.');
}
const sql=neon(connection);
const id=randomUUID().replaceAll('-','');
const a=`dbk55-productA-${id}`, b=`dbk55-productB-${id}`;
const location=`dbk55-store-${id}`, prefix=`dbk55-order-${id}`;
const item=(productId,quantity)=>({productId,quantity,sourceStoreId:location});
const payload=(orderId,providerPaymentId,items)=>({orderId,provider:'paystack',providerPaymentId,
  providerReceipt:`dbk55-receipt-${providerPaymentId}`,amountMinor:12500,currency:'KES',items});
const call=(eventKey,p)=>sql`SELECT public.dbk55_record_paid_pos(${eventKey},${JSON.stringify(p)}::jsonb) AS result`;
const retry=(orderId)=>sql`SELECT public.dbk55_retry_paid_pos_stock(${orderId}) AS result`;
let fixturesCreated=false;
try {
 const meta=await sql`SELECT writes_enabled,seed_fingerprint FROM public.dbk51_stock_engine_config WHERE singleton`;
 if(!meta[0]?.seed_fingerprint || meta[0].writes_enabled) throw new Error('Test seed required; DBK-51 gate must start disabled');
 const config=await sql`SELECT enabled FROM public.dbk55_settlement_config WHERE singleton`;
 if(config[0]?.enabled!==false) throw new Error('DBK-55 settlement gate must start disabled');
 const prereq=await sql`SELECT to_regclass('public.dbk54_stock_batches')::text AS batches,
   to_regclass('public.dbk55_paid_pos_settlements')::text AS settlements`;
 if(!prereq[0]?.batches || !prereq[0]?.settlements) throw new Error('Apply DBK-54 and DBK-55 SQL on TEST branch');
 fixturesCreated=true;
 await sql`INSERT INTO public.dbk51_stock_balances
    (product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint)
    VALUES(${a},'',${location},4,0,'fixture','fixture',${meta[0].seed_fingerprint}),
          (${b},'',${location},1,0,'fixture','fixture',${meta[0].seed_fingerprint})`;
 const order1=`${prefix}-confirmed`, proof1=`dbk55-pay-${id}-1`, event1=`dbk55-confirmed-${id}-1`;
 const p1=payload(order1,proof1,[item(a,1),item(b,1)]);
 await assert.rejects(call(event1,p1),/settlement gate is disabled/);
 await sql`UPDATE public.dbk55_settlement_config SET enabled=true,updated_at=now() WHERE singleton`;
 // Even with stock gate disabled, a confirmed external payment stays PAID and enters review.
 const paidReviewOrder=`${prefix}-stockgate`, proofGate=`dbk55-pay-${id}-gate`, eventGate=`dbk55-confirmed-${id}-gate`;
 const reviewGate=(await call(eventGate,payload(paidReviewOrder,proofGate,[item(a,1)])))[0].result;
 assert.equal(reviewGate.financialStatus,'PAID');
 assert.equal(reviewGate.stockStatus,'REVIEW_REQUIRED');
 await sql`UPDATE public.dbk51_stock_engine_config SET writes_enabled=true,updated_at=now() WHERE singleton`;
 const recovered=(await retry(paidReviewOrder))[0].result;
 assert.equal(recovered.stockStatus,'COMMITTED');
 const first=(await call(event1,p1))[0].result;
 assert.equal(first.financialStatus,'PAID');
 assert.equal(first.stockStatus,'COMMITTED');
 const replay=(await call(event1,p1))[0].result;
 assert.equal(replay.replayed,true);
 const changed={...p1,amountMinor:12501};
 await assert.rejects(call(event1,changed),/Conflicting paid settlement replay/);
 await assert.rejects(call(`dbk55-new-event-${id}`,{...p1,orderId:`${prefix}-duplicate-proof`}),/duplicate key/);
 const order2=`${prefix}-insufficient`, proof2=`dbk55-pay-${id}-2`, event2=`dbk55-confirmed-${id}-2`;
 const p2=payload(order2,proof2,[item(a,1),item(b,9)]);
 const before=await sql`SELECT product_id,on_hand FROM public.dbk51_stock_balances WHERE product_id IN (${a},${b}) ORDER BY product_id`;
 const failedStock=(await call(event2,p2))[0].result;
 assert.equal(failedStock.financialStatus,'PAID');
 assert.equal(failedStock.stockStatus,'REVIEW_REQUIRED');
 const after=await sql`SELECT product_id,on_hand FROM public.dbk51_stock_balances WHERE product_id IN (${a},${b}) ORDER BY product_id`;
 assert.deepEqual(after,before,'Partial inventory deduction escaped an exception block');
 const repeat=(await call(event2,p2))[0].result;
 assert.equal(repeat.replayed,true);
 assert.equal(repeat.stockStatus,'REVIEW_REQUIRED','A duplicate callback must not retry stock');
 // TEST FIXTURE ONLY: simulate a manager receiving stock and authorizing retry.
 await sql`UPDATE public.dbk51_stock_balances SET on_hand=9,updated_at=now()
  WHERE product_id=${b} AND location_id=${location}`;
 const retried=(await retry(order2))[0].result;
 assert.equal(retried.financialStatus,'PAID');
 assert.equal(retried.stockStatus,'COMMITTED');
 const again=(await retry(order2))[0].result;
 assert.equal(again.replayed,true);
 const statuses=await sql`SELECT order_id,financial_status,stock_status,stock_attempts
  FROM public.dbk55_paid_pos_settlements WHERE order_id LIKE ${`${prefix}%`} ORDER BY order_id`;
 assert.equal(statuses.length,3);
 assert.ok(statuses.every(row=>row.financial_status==='PAID' && row.stock_status==='COMMITTED'));
 const batches=await sql`SELECT count(*)::int AS n FROM public.dbk54_stock_batches WHERE order_id LIKE ${`${prefix}%`}`;
 assert.equal(batches[0].n,3);
 console.log(JSON.stringify({stage:'DBK-55',result:'ISOLATED DATABASE TEST PASS',
  paymentProtectedOnStockFailure:true,reviewedRetrySucceeded:true,duplicatePaymentIdRejected:true,
  originalReplayDidNotRededuct:true,atomicStockRollback:true,
  settlementCount:statuses.length,stockBatchCount:batches[0].n,
  financialStatus:'PAID',statuses},null,2));
} finally {
 // Stop any writes before removing all disposable fixture data.
 if(fixturesCreated){
  await sql`UPDATE public.dbk51_stock_engine_config SET writes_enabled=false,updated_at=now() WHERE singleton`;
  await sql`UPDATE public.dbk55_settlement_config SET enabled=false,updated_at=now() WHERE singleton`;
  console.log('TEST stock and paid-settlement write gates disabled.');
  await sql`DELETE FROM public.dbk55_paid_pos_settlements WHERE order_id LIKE ${`${prefix}%`}`;
  await sql`DELETE FROM public.dbk54_stock_batches WHERE order_id LIKE ${`${prefix}%`}`;
  await sql`DELETE FROM public.dbk51_stock_operations WHERE product_id IN (${a},${b})`;
  await sql`DELETE FROM public.dbk51_stock_balances WHERE product_id IN (${a},${b})`;
  console.log('TEST settlement, batch and stock fixture rows removed.');
 }
}
