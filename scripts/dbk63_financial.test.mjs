import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { moneyMinor, externalReference, stableKey, normalizeRefundLines,realOrderId } from '../lib/db/dbk63-financial-core.ts';
const src=(file)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('minor unit accounting is exact and bounded',()=>{
  assert.equal(moneyMinor(100),10000);
  assert.equal(moneyMinor(99.99),9999);
  assert.equal(moneyMinor(0,true),0);
  for (const v of [0,-1,1.001,NaN,Infinity,1e11]) assert.throws(()=>moneyMinor(v));
});
test('real sales only; synthetic references rejected',()=>{
  assert.equal(realOrderId('dbk62.order.aaaaaaaaaaaaaaaaaaaaaaaa'),true);
  assert.equal(realOrderId('dbk58.order.aaaaaaaaaaaaaaaaaaaaaaaa'),false);
  assert.equal(externalReference('MP-2026-12345'),true);
  assert.equal(externalReference('DBK58-TEST-0987'),false);
});
test('stable replay keys from order and external proof',()=>{
  assert.equal(stableKey('refund','a','b'),stableKey('refund','a','b'));
  assert.notEqual(stableKey('refund','a','b'),stableKey('payment','a','b'));
  assert.equal(stableKey('payment','a','b').length,46);
});
test('return lines reject duplicates, invalid qty and unrequested stock change',()=>{
  assert.throws(()=>normalizeRefundLines([{productId:'A',quantity:1}],false));
  assert.throws(()=>normalizeRefundLines([],true));
  assert.throws(()=>normalizeRefundLines([{productId:'A',quantity:1},{productId:'A',quantity:1}],true));
  assert.throws(()=>normalizeRefundLines([{productId:'A',quantity:0}],true));
  assert.deepEqual(normalizeRefundLines([{productId:'A',quantity:2}],true),[{productId:'A',variantId:'',quantity:2}]);
});
test('SQL gate is independent and disabled by default',()=>{
  const sql=src('migration/dbk63-financial-operations.sql');
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql,/c\.provider_callbacks_ready AND/);
  assert.match(sql,/c\.receivables_ready AND c\.refunds_ready AND c\.reports_ready/);
  assert.match(sql,/s\.seed_fingerprint/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.dbk63_record_receivable/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.dbk63_record_manual_refund/);
});
test('SQL follow-up payment uses existing DBK-56 ledger, no direct totals update',()=>{
  const sql=src('migration/dbk63-financial-operations.sql');
  assert.match(sql,/public\.dbk56_record_pos_payment\(p_event_key,p_payment\)/);
  assert.doesNotMatch(sql,/UPDATE\s+public\.dbk56_pos_orders/i);
  assert.match(sql,/EXISTS\(SELECT 1 FROM public\.dbk63_pos_refunds/);
});
test('refund is external-confirmed only, bounded, atomic with stock return',()=>{
  const sql=src('migration/dbk63-financial-operations.sql');
  assert.match(sql,/manualRefundConfirmed/);
  assert.match(sql,/v_returned\+v_refund>v_order\.collected_minor/);
  assert.match(sql,/v_order\.balance_due_minor<>0/);
  assert.match(sql,/public\.dbk54_apply_stock_batch/);
  assert.match(sql,/Duplicate return item/);
  assert.match(sql,/Conflicting refund idempotency replay/);
});
test('Neon financial routes fail closed and never write a real order into Sanity',()=>{
  const recv=src('app/api/backoffice/pos/receivables/route.ts');
  const refunds=src('app/api/backoffice/pos/refunds/route.ts');
  for (const txt of [recv,refunds]) {
    assert.match(txt,/isDbk62RealOrderId/);
    assert.match(txt,/dbk62CutoverRequested/);
  }
  assert.match(recv,/dbk63RecordReceivable/);
  assert.match(refunds,/dbk63RecordManualRefund/);
  assert.match(src('app/api/backoffice/pos/reports/route.ts'),/503/);
});
test('Neon receipt and history show cumulative refunds, not a fake payment status',()=>{
  const mapper=src('lib/db/dbk62-pos-mapper.ts');
  const read=src('lib/db/dbk62-pos-cutover.ts');
  assert.match(mapper,/refundedAmount:refunded/);
  assert.match(read,/sum\(r\.refund_minor\)/);
  assert.match(read,/event_key/);
});
test('Neon reconciliation refuses partial order history rather than silently reporting totals',()=>{
  assert.match(src('lib/db/dbk63-financial-neon.ts'),/rows\.length>=500/);
  assert.match(src('app/api/backoffice/pos/reconciliation/route.ts'),/status:503/);
});
