import test from 'node:test';
import assert from 'node:assert/strict';
import {distinctReportOrders,kesMinor,requireCompletePage,withinWindow} from '../lib/pos/dbk75-report-core.ts';
test('combines distinct historic Sanity and Neon orders',()=>{
  const combined=distinctReportOrders([{id:'sanity-a',paymentReference:'LEGACY-1'}],
    [{id:'dbk62.order.abc',paymentReference:'NEON-1'}]);
  assert.equal(combined.length,2);
});
test('rejects duplicate cross-ledger payment references and order IDs',()=>{
  assert.throws(()=>distinctReportOrders([{id:'sanity',paymentReference:'SAME'}],
    [{id:'neon',paymentReference:'SAME'}]),/overlapping payment/);
  assert.throws(()=>distinctReportOrders([{id:'same'}],[{id:'same'}]),/overlapping order/);
});
test('permits pre-existing repeated Sanity references without hiding additional Neon sales',()=>{
  assert.equal(distinctReportOrders([{id:'a',paymentReference:'OLD'},{id:'b',paymentReference:'OLD'}],
    [{id:'c',paymentReference:'NEW'}]).length,3);
});
test('checks integer minor units exactly',()=>{
  assert.equal(kesMinor('12345'),123.45);
  for(const v of ['-1','1.5','1e10','9007199254740993']) assert.throws(()=>kesMinor(v));
});
test('detects incomplete pages instead of reporting truncated financial totals',()=>{
  assert.doesNotThrow(()=>requireCompletePage(5000,5000,'orders'));
  assert.throws(()=>requireCompletePage(5001,5000,'orders'),/pagination required/);
});
test('filters by exact bounded timestamps',()=>{
  assert.equal(withinWindow('2026-10-29T21:00:00Z','2026-10-29T21:00:00Z','2026-10-30T20:59:59Z'),true);
  assert.equal(withinWindow('2026-10-29T20:59:59Z','2026-10-29T21:00:00Z','2026-10-30T20:59:59Z'),false);
});
