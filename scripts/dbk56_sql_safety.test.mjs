import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync('migration/dbk56/pos-order-payment-ledger.sql','utf8');
const adapter = readFileSync('lib/db/pos-order-ledger-neon.ts','utf8');
const pos = readFileSync('lib/pos/server.ts','utf8');
const manual = readFileSync('lib/pos/manual-payment.ts','utf8');
test('gate exists and defaults OFF even if SQL is re-applied',()=>{
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql,/ON CONFLICT\(singleton\) DO NOTHING/);
  assert.equal((sql.match(/DBK-56 write gate is disabled/g)||[]).length,2);
});
test('monetary values and derived balances use integer minor units',()=>{
  assert.match(sql,/collected_minor bigint NOT NULL DEFAULT 0/);
  assert.match(sql,/balance_due_minor bigint GENERATED ALWAYS AS/);
  assert.match(sql,/overpaid_minor bigint GENERATED ALWAYS AS/);
  assert.match(sql,/PARTIALLY_PAID/);
  assert.match(manual,/manualPaymentBreakdown/);
});
test('line totals and order totals are computed by Postgres',()=>{
  assert.match(sql,/CHECK \(line_total_minor=quantity::bigint\*unit_price_minor\)/);
  assert.match(sql,/v_subtotal:=v_subtotal\+v_qty::numeric\*v_price::numeric/);
  assert.match(sql,/v_total:=v_subtotal\+v_delivery::numeric-v_discount::numeric/);
});
test('order idempotency and payment evidence uniqueness',()=>{
  assert.match(sql,/request_key text NOT NULL UNIQUE/);
  assert.match(sql,/order_number text NOT NULL UNIQUE/);
  assert.match(sql,/UNIQUE\(provider,provider_reference\)/);
  assert.match(sql,/original_payload<>p_payload/);
  assert.match(sql,/dbk56_one_initial_payment_idx/);
});
test('payment races lock order and receivable cannot exceed remaining balance',()=>{
  assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('dbk56:order:'\|\|v_order_id,56\)\)/);
  assert.match(sql,/WHERE order_id=v_order_id FOR UPDATE/);
  assert.match(sql,/v_amount::bigint>v_order.balance_due_minor/);
});
test('new functions have public access revoked and no hooks in legacy POS',()=>{
  assert.equal((sql.match(/REVOKE ALL ON FUNCTION/g)||[]).length,2);
  assert.doesNotMatch(pos,/createNeonPosLedgerOrder|recordNeonPosLedgerPayment/);
  assert.match(adapter,/DBK_POS_LEDGER_CUTOVER/);
  assert.match(adapter,/DBK_POS_SETTLEMENT_CUTOVER/);
});
test('ledger does not call stock functions or trust provider claims',()=>{
  assert.doesNotMatch(sql,/\bdbk54_apply_stock_batch\(/);
  assert.doesNotMatch(sql,/\bdbk55_record_paid_pos\(/);
  assert.match(sql,/Provider verification is a future integration requirement/);
});
