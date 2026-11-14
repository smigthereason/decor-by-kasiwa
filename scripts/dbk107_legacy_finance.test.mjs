import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {dbk107ValidateMoney,dbk107ApplyLegacyBalances} from '../lib/db/dbk107-legacy-finance-core.ts';
const core=readFileSync(new URL('../lib/db/dbk107-legacy-finance-core.ts',import.meta.url),'utf8');
const route=readFileSync(new URL('../app/api/backoffice/pos/receivables/route.ts',import.meta.url),'utf8');
const sql=readFileSync(new URL('../migration/dbk107-legacy-neon-receivables.sql',import.meta.url),'utf8');
const report=readFileSync(new URL('../lib/pos/operations.ts',import.meta.url),'utf8');
const refunds=readFileSync(new URL('../app/api/backoffice/pos/refunds/route.ts',import.meta.url),'utf8');
test('legacy SQL uses append-only events and a locked account row',()=>{
  assert.match(sql,/FOR UPDATE/);assert.match(sql,/provider_reference text NOT NULL UNIQUE/);
  assert.match(sql,/request_key text PRIMARY KEY/);assert.match(sql,/Replayed request differs/);
  assert.match(sql,/Legacy source changed after Neon collections began/);
  assert.doesNotMatch(sql,/\bUPDATE\s+public\.dbk51_stock_balances/i);
});
test('Neon-only mode never falls back to Sanity finance mutations',()=>{
  assert.match(route,/DBK102_OPERATIONAL_NEON_ONLY === 'YES'/);
  assert.match(refunds,/DBK102_OPERATIONAL_NEON_ONLY === 'YES'/);
  assert.match(route,/dbk107RecordLegacyCollection/);
});
test('finance reports count legacy Neon collection cash without treating it as new sales',()=>{
  assert.match(report,/legacyCollections\.totalPeriodKES/);
  assert.match(report,/legacyCollections\.totalAllKES/);
  assert.match(report,/dbk107ApplyToLegacyOrders/);
});
test('amount and original debt bounds are checked before writing',()=>{
  assert.match(core,/Number\.isSafeInteger/);assert.match(sql,/v_collected \+ v_amount > v_balance/);
});

test('two-decimal KES validation rejects fractional cents and invalid numbers',()=>{
  assert.equal(dbk107ValidateMoney(1234.50),123450);
  for(const value of [NaN,Infinity,-1,0.001,1.234,1e11,'20'])
    assert.throws(()=>dbk107ValidateMoney(value));
});
test('append-only receipts reduce visible debt without modifying original objects',()=>{
  const original={id:'legacy.1',balanceDue:2000,amountPaid:500,paymentStatus:'partially_paid'};
  const partial=dbk107ApplyLegacyBalances([original],[{order_id:'legacy.1',amount_minor:75000}]);
  assert.equal(partial[0].balanceDue,1250);assert.equal(partial[0].amountPaid,1250);
  assert.equal(original.balanceDue,2000);
  const complete=dbk107ApplyLegacyBalances([original],[{order_id:'legacy.1',amount_minor:200000}]);
  assert.equal(complete[0].balanceDue,0);assert.equal(complete[0].paymentStatus,'paid');
  assert.throws(()=>dbk107ApplyLegacyBalances([original],[{order_id:'legacy.1',amount_minor:200001}]));
  assert.throws(()=>dbk107ApplyLegacyBalances([original],[{order_id:'legacy.1',amount_minor:10000,original_balance_minor:300000}]));
});
