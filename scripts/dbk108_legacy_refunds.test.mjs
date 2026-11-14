import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dbk108MoneyMinor,dbk108ApplyRefunds} from '../lib/db/dbk108-legacy-refunds-core.ts';
const src=(name)=>readFileSync(new URL(name,import.meta.url),'utf8');
test('money validation protects KES minor units',()=>{
  assert.equal(dbk108MoneyMinor(1030.50),103050);
  for(const n of [Infinity,NaN,-1,0.001,100_000_000_000,'10'])
    assert.throws(()=>dbk108MoneyMinor(n));
});
test('historic refunds only adjust new immutable view and fail on Sanity drift',()=>{
  const original={id:'s.1',amountPaid:2000,refundedAmount:200,paymentStatus:'paid'};
  const rows=[{order_id:'s.1',amount_minor:30000,original_refunded_minor:20000}];
  assert.equal(dbk108ApplyRefunds([original],rows)[0].refundedAmount,500);
  assert.equal(original.refundedAmount,200);
  assert.throws(()=>dbk108ApplyRefunds([original],[{...rows[0],original_refunded_minor:20001}]));
  assert.throws(()=>dbk108ApplyRefunds([original],[{...rows[0],amount_minor:200000}]));
});
test('refund migration is audit-only and serializes unique external references',()=>{
  const sql=src('../migration/dbk108-legacy-neon-refunds.sql');
  assert.match(sql,/external_reference text NOT NULL UNIQUE/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/FOR UPDATE/);
  assert.match(sql,/Cumulative refunds exceed historical receipt/);
  assert.doesNotMatch(sql,/UPDATE\s+public\.dbk51_stock_balances/);
  assert.doesNotMatch(sql,/UPDATE\s+public\.dbk107_legacy_receivable_accounts/);
});
test('source route uses Neon-only when operational authority is Neon',()=>{
  const route=src('../app/api/backoffice/pos/refunds/route.ts');
  assert.match(route,/dbk108RecordLegacyRefund/);
  assert.match(route,/DBK102_OPERATIONAL_NEON_ONLY/);
});
