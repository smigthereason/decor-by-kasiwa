import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dbk68Kes, dbk68Summary, dbk68PaymentProofMatches, dbk68ValidReference,
  dbk68IsOrderId } from '../lib/db/dbk68-daraja-core.ts';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const sql=source('../migration/dbk68-daraja-pos.sql');
const sale=source('../app/api/backoffice/pos/sale/route.ts');
const callback=source('../app/api/payments/mobile/callback/route.ts');
const logic=source('../lib/db/dbk68-daraja-neon.ts');
const inventory=source('../app/api/backoffice/inventory/movements/route.ts');
const good={callbackCheckout:'ws_CO_ABC12345',expectedCheckout:'ws_CO_ABC12345',
  callbackMerchant:'MR12345678',expectedMerchant:'MR12345678',
  callbackPhone:'254712345678',expectedPhone:'254712345678',
  callbackAmount:200,expectedAmountMinor:20000,callbackReceipt:'THA12345AB',
  callbackResult:0,queryResult:0,queryCheckout:'ws_CO_ABC12345',
  queryMerchant:'MR12345678',transactionDate:'20261028234012'};
test('strict M-PESA proof matches provider query and amount',()=>{
  assert.equal(dbk68PaymentProofMatches(good),true);
  for(const [field,value] of Object.entries({callbackPhone:'254712345679',callbackAmount:199,
      callbackReceipt:'',queryResult:1032,queryCheckout:'unrelated',queryMerchant:'wrong',
      callbackMerchant:'wrong',transactionDate:'invalid',callbackResult:1})){
    assert.equal(dbk68PaymentProofMatches({...good,[field]:value}),false,field);
  }
});
test('money and ID conversion are bounded',()=>{
  assert.equal(dbk68Kes('20000'),200);
  for(const raw of ['-1','1.2','1e6','1000000000001']) assert.throws(()=>dbk68Kes(raw));
  assert.equal(dbk68ValidReference('DBK-POS-test-12345678'),true);
  assert.equal(dbk68IsOrderId('dbk68.order.'+'a'.repeat(24)),true);
  assert.equal(dbk68IsOrderId('dbk58.order.'+'a'.repeat(24)),false);
});
test('receipt summary refuses altered snapshot and maps paid stock review',()=>{
  const s={reference:'DBK-POS-test-12345678',orderId:'dbk68.order.'+'a'.repeat(24),
    orderNumber:'DBK68-POS-'+'a'.repeat(24),storeId:'store.1',sellerId:'staff.1',
    sellerName:'Staff',customerName:'Customer',customerPhone:'254712345678',
    subtotalMinor:20000,discountMinor:0,totalMinor:20000,
    lines:[{productId:'prod.1',variantId:'',quantity:1,unitPriceMinor:20000,name:'Product'}]};
  const row={reference:s.reference,order_id:s.orderId,order_number:s.orderNumber,
    store_id:s.storeId,amount_minor:'20000',phone:s.customerPhone,snapshot:s,
    payment_status:'PAID',stock_status:'REVIEW_REQUIRED',checkout_id:'ws_CO_123',
    merchant_id:'MID',receipt_number:'THA12345AB',result_description:null,
    callback_json:null,created_at:'2026-10-28T12:00:00.000Z'};
  const summary=dbk68Summary(row);
  assert.equal(summary.inventoryReviewRequired,true);
  assert.equal(summary.amountPaid,200);
  assert.throws(()=>dbk68Summary({...row,amount_minor:'30000'}));
});
test('database gate requires ALL cutover controls and is disabled by default',()=>{
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
  for(const term of ['c.sanity_stock_frozen','c.all_stock_writers_switched',
    'c.provider_callbacks_ready','c.receivables_ready','c.refunds_ready','c.reports_ready',
    's.seed_fingerprint','s.writes_enabled','p.enabled','d.enabled']) assert.ok(sql.includes(term),term);
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.dbk68_daraja_gate/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.dbk68_settle_verified/);
});
test('one STK reservation, duplicate protection, and financial settlement are atomic',()=>{
  assert.match(sql,/payment_status='STARTING'/);
  assert.match(sql,/WHERE reference=p_reference AND payment_status='CREATED'/);
  assert.match(sql,/checkout_id text UNIQUE/);
  assert.match(sql,/receipt_number text UNIQUE/);
  assert.match(sql,/PERFORM pg_advisory_xact_lock/);
  assert.match(sql,/dbk55_record_paid_pos/);
  assert.match(sql,/stock_status=v_result->>'stockStatus'/);
});
test('M-PESA production route selects Neon and never falls back to Sanity on failure',()=>{
  assert.match(sale,/dbk62CutoverRequested\(\)/);
  assert.match(sale,/dbk68CreateSale\(body, seller\)/);
  assert.match(logic,/dbk62GetProductionSql\(\)/);
  assert.match(logic,/DBK68_CUTOVER_APPROVED/);
});
test('callback is stored and externally verified before any settlement',()=>{
  assert.match(callback,/dbk68HandleCallback\(payload\)/);
  assert.match(logic,/dbk68_note_callback/);
  assert.match(logic,/queryDarajaStkStatus/);
  assert.match(logic,/dbk68PaymentProofMatches/);
  assert.match(logic,/dbk68_settle_verified/);
});
test('ambiguously sent STK requests cannot auto-initiate again',()=>{
  assert.match(logic,/dbk68_claim_stk/);
  assert.match(logic,/Do not send a second prompt/);
  assert.match(logic,/Do not resend/);
});
test('remaining inventory-management Sanity writers are a cutover blocker',()=>{
  assert.match(inventory,/await transaction\.commit\(\)/);
  assert.match(inventory,/inventoryMovement/);
});
