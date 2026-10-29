#!/usr/bin/env node
// DISPOSABLE FIXTURE WRITES — only run on independently verified Neon dbk51-test.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const connection=process.env.DATABASE_URL;
const url=connection && new URL(connection);
const testHost=process.env.DBK51_EXPECTED_TEST_HOST;
const productionHost=process.env.DBK51_PRODUCTION_HOST;
if(!url || !testHost || !productionHost || testHost===productionHost ||
   url.hostname!==testHost || url.hostname===productionHost ||
   process.env.DBK51_TEST_WRITE!=='YES') {
  throw new Error('REFUSING DBK-56: confirm isolated Neon TEST host and DBK51_TEST_WRITE=YES');
}
const sql=neon(connection);
const token=randomUUID().replaceAll('-','');
const prefix=`dbk56-fixture-${token}`;
const a=`${prefix}-partial`, b=`${prefix}-overpay`, c=`${prefix}-race`;
const base=(orderId)=>({orderId,orderNumber:orderId.toUpperCase(),channel:'POS',
 storeId:`${prefix}-store`,sellerId:`${prefix}-seller`,currency:'KES',discountMinor:0,deliveryMinor:0,
 items:[{productId:`${prefix}-product`,storeId:`${prefix}-store`,quantity:2,unitPriceMinor:5000}]});
const mkOrder=(id,p)=>sql`SELECT public.dbk56_create_pos_order(${`dbk56-key-${id}`},${JSON.stringify(p)}::jsonb) AS result`;
const mkPayment=(key,p)=>sql`SELECT public.dbk56_record_pos_payment(${key},${JSON.stringify(p)}::jsonb) AS result`;
const payment=(orderId,reference,amountMinor,purpose='INITIAL')=>({orderId,provider:'manual',
 providerReference:reference,purpose,amountMinor,evidenceReference:reference});
let gateUsed=false;
try {
  const config=await sql`SELECT enabled FROM public.dbk56_ledger_config WHERE singleton`;
  if(config.length!==1 || config[0].enabled!==false) throw new Error('DBK-56 gate must start disabled');
  const stock=await sql`SELECT writes_enabled FROM public.dbk51_stock_engine_config WHERE singleton`;
  const settlement=await sql`SELECT enabled FROM public.dbk55_settlement_config WHERE singleton`;
  if(stock[0]?.writes_enabled!==false || settlement[0]?.enabled!==false) throw new Error('DBK-51/55 gates must stay OFF');
  await assert.rejects(mkOrder(a,base(a)),/DBK-56 write gate is disabled/);
  await sql`UPDATE public.dbk56_ledger_config SET enabled=true,updated_at=now() WHERE singleton`;
  gateUsed=true;
  const created=(await mkOrder(a,base(a)))[0].result;
  assert.equal(created.financialStatus,'UNPAID');
  assert.equal(created.totalMinor,10000);
  assert.equal((await mkOrder(a,base(a)))[0].result.replayed,true);
  await assert.rejects(mkOrder(a,{...base(a),deliveryMinor:300}),/Conflicting DBK-56 order replay/);
  const firstKey=`${prefix}-event-one`;
  const first=payment(a,`${prefix}-ref-1`,4000);
  const partial=(await mkPayment(firstKey,first))[0].result;
  assert.equal(partial.financialStatus,'PARTIALLY_PAID');
  assert.equal(partial.balanceDueMinor,6000);
  assert.equal((await mkPayment(firstKey,first))[0].result.replayed,true);
  await assert.rejects(mkPayment(firstKey,{...first,amountMinor:5000}),/Conflicting DBK-56 payment replay/);
  await assert.rejects(mkPayment(`${prefix}-other`,{...first,providerReference:`${prefix}-ref-other`}),/Initial payment already recorded/);
  const second=(await mkPayment(`${prefix}-event-two`,payment(a,`${prefix}-ref-2`,6000,'RECEIVABLE')))[0].result;
  assert.equal(second.financialStatus,'PAID');
  assert.equal(second.balanceDueMinor,0);
  await assert.rejects(mkPayment(`${prefix}-event-three`,payment(a,`${prefix}-ref-3`,1,'RECEIVABLE')),
   /Receivable payment exceeds outstanding balance/);
  await mkOrder(b,base(b));
  const overpaid=(await mkPayment(`${prefix}-event-over`,payment(b,`${prefix}-ref-over`,12000)))[0].result;
  assert.equal(overpaid.financialStatus,'PAID');
  assert.equal(overpaid.overpaidMinor,2000);
  await mkOrder(c,base(c));
  await mkPayment(`${prefix}-event-race0`,payment(c,`${prefix}-ref-race0`,6000));
  const settled=await Promise.allSettled([
    mkPayment(`${prefix}-event-race1`,payment(c,`${prefix}-ref-race1`,4000,'RECEIVABLE')),
    mkPayment(`${prefix}-event-race2`,payment(c,`${prefix}-ref-race2`,4000,'RECEIVABLE')),
  ]);
  assert.equal(settled.filter(v=>v.status==='fulfilled').length,1);
  assert.equal(settled.filter(v=>v.status==='rejected').length,1);
  const states=await sql`SELECT order_id,financial_status,collected_minor,balance_due_minor,overpaid_minor
    FROM public.dbk56_pos_orders WHERE order_id IN (${a},${b},${c}) ORDER BY order_id`;
  assert.equal(states.length,3);
  assert.ok(states.every(r=>r.financial_status==='PAID'));
  const lines=await sql`SELECT count(*)::integer AS n FROM public.dbk56_pos_order_lines
    WHERE order_id IN (${a},${b},${c})`;
  assert.equal(lines[0].n,3);
  const payments=await sql`SELECT count(*)::integer AS n FROM public.dbk56_pos_payments
    WHERE order_id IN (${a},${b},${c})`;
  assert.equal(payments[0].n,5);
  console.log(JSON.stringify({stage:'DBK-56',result:'ISOLATED LEDGER TEST PASS',
    partialThenPaid:true,originalReplay:true,changedPayloadRejected:true,
    receivableOverpaymentRejected:true,initialOverpaymentTracked:true,
    concurrentReceivableSuccesses:1,concurrentReceivableRejections:1,
    fixtureOrders:3,fixturePayments:5,states},null,2));
} finally {
  // Disable first. Deletes refer ONLY to this run's unique fixture order IDs.
  if(gateUsed) {
    await sql`UPDATE public.dbk56_ledger_config SET enabled=false,updated_at=now() WHERE singleton`;
    console.log('DBK-56 TEST write gate disabled.');
    await sql`DELETE FROM public.dbk56_pos_payments WHERE order_id IN (${a},${b},${c})`;
    await sql`DELETE FROM public.dbk56_pos_order_lines WHERE order_id IN (${a},${b},${c})`;
    await sql`DELETE FROM public.dbk56_pos_orders WHERE order_id IN (${a},${b},${c})`;
    console.log('DBK-56 TEST fixture rows removed.');
  }
}
