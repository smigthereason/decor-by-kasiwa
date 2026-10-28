#!/usr/bin/env node
// ISOLATED NEON TEST BRANCH ONLY. Disposable fixtures, no provider calls.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const connection=process.env.DATABASE_URL;
const host=connection && new URL(connection).hostname;
const expected=process.env.DBK51_EXPECTED_TEST_HOST, production=process.env.DBK51_PRODUCTION_HOST;
if (!connection || !expected || !production || expected===production || host!==expected ||
    host===production || process.env.DBK51_TEST_WRITE!=='YES' ||
    process.env.DBK57_ISOLATED_MANUAL_TEST!=='YES') {
  throw new Error('REFUSING DBK-57: verified isolated Neon TEST host, DBK51_TEST_WRITE and DBK57_ISOLATED_MANUAL_TEST required');
}
const sql=neon(connection);
const suffix=randomUUID().replaceAll('-','');
const prefix=`dbk57-fixture-${suffix}`;
const p1=`${prefix}-product-1`,p2=`${prefix}-product-2`,store=`${prefix}-store`;
const orders=['partial','insufficient','duplicate-proof','overpay','race'].map(v=>`${prefix}-${v}`);
const [partial,bad,duplicate,overpay,race]=orders;
const receipt=(tag)=>`${prefix}-receipt-${tag}`;
const order=(id,lines=[{productId:p1,storeId:store,quantity:1,unitPriceMinor:10000},
  {productId:p2,storeId:store,quantity:1,unitPriceMinor:5000}])=>({orderId:id,orderNumber:id.toUpperCase(),
  channel:'POS',storeId:store,sellerId:`${prefix}-cashier`,currency:'KES',deliveryMinor:0,
  discountMinor:0,items:lines});
const payload=(id,ref,amountMinor,lines,overpaymentApproved=false)=>({
  order:order(id,lines), payment:{orderId:id,provider:'manual',providerReference:ref,
    purpose:'INITIAL',amountMinor,evidenceReference:ref},cashierConfirmed:true,overpaymentApproved});
const call=(key,body)=>sql`SELECT public.dbk57_record_manual_sale(${key},${JSON.stringify(body)}::jsonb) AS result`;
const key=(tag)=>`${prefix}-key-${tag}`;
const oneLine=(quantity)=>[{productId:p1,storeId:store,quantity,unitPriceMinor:10000}];
let didCreateFixture=false;
try {
  const [stock,ledger,manual,paid,objects]=await Promise.all([
    sql`SELECT writes_enabled,seed_fingerprint FROM public.dbk51_stock_engine_config WHERE singleton`,
    sql`SELECT enabled FROM public.dbk56_ledger_config WHERE singleton`,
    sql`SELECT enabled FROM public.dbk57_manual_sale_config WHERE singleton`,
    sql`SELECT enabled FROM public.dbk55_settlement_config WHERE singleton`,
    sql`SELECT to_regclass('public.dbk57_manual_sales')::text AS dbk57_table, to_regclass('public.dbk54_stock_batches')::text AS stock_batches`,
  ]);
  if(stock[0]?.writes_enabled!==false || !stock[0]?.seed_fingerprint || ledger[0]?.enabled!==false ||
     manual[0]?.enabled!==false || paid[0]?.enabled!==false ||
     !objects[0]?.dbk57_table || !objects[0]?.stock_batches) {
    throw new Error('DBK-57 prerequisites absent or a test gate was already enabled. Do not continue.');
  }
  await assert.rejects(call(key('before-gate'),payload(partial,receipt('before'),5000)),/DBK-57 manual sale gate is disabled/);
  didCreateFixture=true;
  await sql`INSERT INTO public.dbk51_stock_balances
    (product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint)
    VALUES(${p1},'',${store},5,0,'fixture','fixture',${stock[0].seed_fingerprint}),
          (${p2},'',${store},2,0,'fixture','fixture',${stock[0].seed_fingerprint})`;
  await sql`UPDATE public.dbk51_stock_engine_config SET writes_enabled=true,updated_at=now() WHERE singleton`;
  await sql`UPDATE public.dbk56_ledger_config SET enabled=true,updated_at=now() WHERE singleton`;
  await sql`UPDATE public.dbk57_manual_sale_config SET enabled=true,updated_at=now() WHERE singleton`;

  const main=payload(partial,receipt('partial'),5000);
  const first=(await call(key('partial'),main))[0].result;
  assert.equal(first.financialStatus,'PARTIALLY_PAID');
  assert.equal(Number(first.balanceDueMinor),10000);
  assert.equal(first.stockCommitted,true);
  assert.equal((await call(key('partial'),main))[0].result.replayed,true);
  await assert.rejects(call(key('partial'),{...main,payment:{...main.payment,amountMinor:6000}}),/Conflicting DBK-57 manual sale replay/);

  const before=await sql`SELECT product_id,on_hand FROM public.dbk51_stock_balances
    WHERE product_id IN (${p1},${p2}) ORDER BY product_id`;
  await assert.rejects(call(key('bad'),payload(bad,receipt('bad'),5000,[
    {productId:p1,storeId:store,quantity:1,unitPriceMinor:10000},
    {productId:p2,storeId:store,quantity:99,unitPriceMinor:5000}
  ])),/Insufficient stock/);
  const after=await sql`SELECT product_id,on_hand FROM public.dbk51_stock_balances
    WHERE product_id IN (${p1},${p2}) ORDER BY product_id`;
  assert.deepEqual(after,before,'Failed manual sale deducted stock');
  assert.equal((await sql`SELECT count(*)::int AS n FROM public.dbk56_pos_orders WHERE order_id=${bad}`)[0].n,0,
    'Failed stock must not create an orphan manual order');
  await assert.rejects(call(key('dup'),payload(duplicate,receipt('partial'),10000,oneLine(1))),/duplicate key/);
  assert.equal((await sql`SELECT count(*)::int AS n FROM public.dbk56_pos_orders WHERE order_id=${duplicate}`)[0].n,0,
    'Duplicate receipt must roll back both stock and order');
  const afterDuplicate=await sql`SELECT product_id,on_hand FROM public.dbk51_stock_balances
    WHERE product_id IN (${p1},${p2}) ORDER BY product_id`;
  assert.deepEqual(afterDuplicate,before,'Duplicate receipt must roll back stock too');
  await assert.rejects(call(key('overpay'),payload(overpay,receipt('over'),12000,oneLine(1))),
    /overpayment requires cashier approval/);
  const approved=(await call(key('overpay'),payload(overpay,receipt('over'),12000,oneLine(1),true)))[0].result;
  assert.equal(approved.financialStatus,'PAID');
  assert.equal(Number(approved.overpaidMinor),2000);

  const raceBody=payload(race,receipt('race'),10000,oneLine(1));
  const both=await Promise.all([
    call(key('race'),raceBody),call(key('race'),raceBody),
  ]);
  assert.equal(both.filter(v=>v[0].result.replayed).length,1);
  assert.equal(both.filter(v=>!v[0].result.replayed).length,1);
  // Subsequent receivable is recorded once, without another stock deduction.
  const later={orderId:partial,provider:'manual',providerReference:receipt('receivable'),
    purpose:'RECEIVABLE',amountMinor:10000,evidenceReference:receipt('receivable')};
  const laterKey=`${prefix}-receivable-event`;
  const laterPayment=(await sql`SELECT public.dbk56_record_pos_payment(
    ${laterKey},${JSON.stringify(later)}::jsonb) AS result`)[0].result;
  assert.equal(laterPayment.financialStatus,'PAID');
  assert.equal(Number(laterPayment.balanceDueMinor),0);
  const laterReplay=(await sql`SELECT public.dbk56_record_pos_payment(
    ${laterKey},${JSON.stringify(later)}::jsonb) AS result`)[0].result;
  assert.equal(laterReplay.replayed,true);
  const rows=await sql`SELECT order_id,financial_status,collected_minor,balance_due_minor,overpaid_minor
    FROM public.dbk56_pos_orders WHERE order_id IN (${partial},${bad},${duplicate},${overpay},${race}) ORDER BY order_id`;
  assert.equal(rows.length,3);
  const batches=await sql`SELECT count(*)::int AS n FROM public.dbk54_stock_batches
    WHERE order_id IN (${partial},${bad},${duplicate},${overpay},${race})`;
  assert.equal(batches[0].n,3);
  const receipts=await sql`SELECT count(*)::int AS n FROM public.dbk56_pos_payments
    WHERE order_id IN (${partial},${bad},${duplicate},${overpay},${race})`;
  assert.equal(receipts[0].n,4);
  console.log(JSON.stringify({stage:'DBK-57',result:'ISOLATED MANUAL POS ATOMIC TEST PASS',
    partialThenReceivablePaid:true,stockFailureRolledBack:true,duplicatePaymentRolledBack:true,
    overpaymentApprovalRequired:true,concurrentReplayDidNotDeductTwice:true,
    orders:rows.length,stockBatches:batches[0].n,payments:receipts[0].n,
    states:rows},null,2));
} finally {
  // Disable all test gates BEFORE fixture cleanup. Never use prefix-only wildcards.
  if(didCreateFixture){
    await sql`UPDATE public.dbk57_manual_sale_config SET enabled=false,updated_at=now() WHERE singleton`;
    await sql`UPDATE public.dbk56_ledger_config SET enabled=false,updated_at=now() WHERE singleton`;
    await sql`UPDATE public.dbk51_stock_engine_config SET writes_enabled=false,updated_at=now() WHERE singleton`;
    console.log('DBK-57/56/51 TEST gates disabled.');
    await sql`DELETE FROM public.dbk57_manual_sales WHERE order_id IN (${partial},${bad},${duplicate},${overpay},${race})`;
    await sql`DELETE FROM public.dbk56_pos_payments WHERE order_id IN (${partial},${bad},${duplicate},${overpay},${race})`;
    await sql`DELETE FROM public.dbk54_stock_batches WHERE order_id IN (${partial},${bad},${duplicate},${overpay},${race})`;
    await sql`DELETE FROM public.dbk56_pos_order_lines WHERE order_id IN (${partial},${bad},${duplicate},${overpay},${race})`;
    await sql`DELETE FROM public.dbk56_pos_orders WHERE order_id IN (${partial},${bad},${duplicate},${overpay},${race})`;
    await sql`DELETE FROM public.dbk51_stock_operations WHERE product_id IN (${p1},${p2})`;
    await sql`DELETE FROM public.dbk51_stock_balances WHERE product_id IN (${p1},${p2})`;
    console.log('DBK-57 test fixtures removed.');
  }
}
