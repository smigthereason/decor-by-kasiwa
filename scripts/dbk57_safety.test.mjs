import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql=readFileSync('migration/dbk57/manual-pos-atomic.sql','utf8');
const wrapper=readFileSync('lib/db/pos-manual-transaction-neon.ts','utf8');
const smoke=readFileSync('scripts/dbk57_manual_smoke.mjs','utf8');
test('new manual POS gate defaults disabled',()=>{
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql,/manual sale gate is disabled/);
});
test('one PostgreSQL call composes order, basket, and payment',()=>{
  assert.match(sql,/dbk56_create_pos_order/);
  assert.match(sql,/dbk54_apply_stock_batch/);
  assert.match(sql,/dbk56_record_pos_payment/);
  assert.match(sql,/IF v_order_result->>'replayed' = 'true'/);
  assert.ok(sql.indexOf('v_order_result := public.dbk56_create_pos_order') < sql.indexOf('v_stock_result := public.dbk54_apply_stock_batch'));
  assert.ok(sql.indexOf('v_stock_result := public.dbk54_apply_stock_batch') < sql.indexOf('v_payment_result := public.dbk56_record_pos_payment'));
  assert.match(wrapper,/getNeonSql\(\)`SELECT public\.dbk57_record_manual_sale\(/);
});
test('derived stock lines cannot be independently requested',()=>{
  assert.match(sql,/jsonb_agg\(jsonb_build_object/);
  assert.match(sql,/jsonb_array_elements\(v_order->'items'\)/);
  assert.match(sql,/sourceStoreId', v_store_id/);
  assert.match(sql,/p_payload - 'order' - 'payment'/);
});
test('manual receipt requires explicit cashier confirmation',()=>{
  assert.match(sql,/cashierConfirmed/);
  assert.match(sql,/payment->>'provider' IS DISTINCT FROM 'manual'/);
  assert.match(sql,/overpayment requires cashier approval/);
});
test('strict test host and feature gate required; no live POS route wired',()=>{
  assert.match(wrapper,/DBK57_ISOLATED_MANUAL_TEST/);
  assert.match(wrapper,/DBK51_PRODUCTION_HOST/);
  assert.match(smoke,/DBK57_ISOLATED_MANUAL_TEST/);
  assert.doesNotMatch(sql,/UPDATE\s+public\.commerceOrder/i);
});
test('replay verifies full payload and function is not public',()=>{
  assert.match(sql,/v_existing.original_payload <> p_payload/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public.dbk57_record_manual_sale/);
  assert.match(sql,/pg_advisory_xact_lock/);
});
test('smoke covers rollback, partial settlement, receivable, duplicate proof and replay',()=>{
  assert.match(smoke,/partialThenReceivablePaid:true/);
  assert.match(smoke,/stockFailureRolledBack:true/);
  assert.match(smoke,/duplicatePaymentRolledBack:true/);
  assert.match(smoke,/concurrentReplayDidNotDeductTwice:true/);
  assert.match(smoke,/TEST gates disabled/);
});
