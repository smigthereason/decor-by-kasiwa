import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapDbk61HistoryOrder, dbk61TestReceipt, filterDbk61History, isDbk61SyntheticOrderId } from '../lib/db/dbk61-pos-mapper.ts';
const src = path => readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const id = 'dbk58.order.111111111111111111111111';
function sample(overrides={}) { return {
  order_id:id, order_number:'DBK58-TEST-111111111111111111111111',store_id:'store.one',seller_id:'staff.one',
  subtotal_minor:'20000',discount_minor:'0',delivery_minor:'0',total_minor:'20000',collected_minor:'10000',
  balance_due_minor:'10000',overpaid_minor:'0',financial_status:'PARTIALLY_PAID',created_at:'2026-10-28T10:00:00.000Z',
  display_snapshot:{ storeName:'OTC Mall',sellerName:'TEST ADMIN', productNames:['Pipe Cleaner Vases'] },
  lines:[{ product_id:'product.one',variant_id:'',quantity:1,unit_price_minor:'20000'}],
  payments:[{ provider:'manual',provider_reference:'DBK58-TEST-ABCD1',payment_purpose:'INITIAL',amount_minor:'10000'}],
  stageOnly:true,simulatedPayment:true,...overrides,
}; }
test('maps synthetic Neon POS order to existing history shape with exact KES conversion',()=>{
  const h=mapDbk61HistoryOrder(sample());
  assert.equal(h.id,id);assert.equal(h.total,200);assert.equal(h.amountPaid,100);assert.equal(h.balanceDue,100);
  assert.equal(h.paymentStatus,'partially_paid');assert.equal(h.lineItems[0].name,'Pipe Cleaner Vases');
  assert.equal(h.paymentReference,'DBK58-TEST-ABCD1');assert.equal(h.simulatedPayment,true);
});
test('receipt conspicuously marked TEST ONLY, no provider payment claims',()=>{
  const r=dbk61TestReceipt(sample());
  assert.equal(r._id,id);assert.match(r.businessName,/TEST ONLY/);assert.match(r.businessWebsite,/NOT A REAL RECEIPT/);
  assert.equal(r.paymentStatus,'partially_paid');
});
test('filters branch, cashier, channel, text and Kenya dates',()=>{
  const o=mapDbk61HistoryOrder(sample());
  assert.equal(filterDbk61History([o],{storeId:'store.two'}).length,0);
  assert.equal(filterDbk61History([o],{storeId:'store.one',query:'cleaner'}).length,1);
  assert.equal(filterDbk61History([o],{channel:'ONLINE'}).length,0);
  assert.equal(filterDbk61History([o],{from:'2026-10-28',to:'2026-10-28'}).length,1);
  assert.throws(()=>filterDbk61History([o],{from:'2026-10-29',to:'2026-10-28'}));
});
test('fails closed on real, unsaved or malformed orders and amounts',()=>{
  assert.equal(isDbk61SyntheticOrderId('commerceOrder.pos.1'),false);
  assert.throws(()=>mapDbk61HistoryOrder(sample({order_id:'commerceOrder.pos.1'})));
  assert.throws(()=>mapDbk61HistoryOrder(sample({stageOnly:false})));
  assert.throws(()=>mapDbk61HistoryOrder(sample({total_minor:'-20000'})));
  assert.throws(()=>mapDbk61HistoryOrder(sample({total_minor:'99999999999999999'})));
});
test('real sale route is untouched for requests without explicit sandbox header',()=>{
 const s=src('app/api/backoffice/pos/sale/route.ts');
 assert.match(s,/const sandboxHeader = request\.headers\.get\("x-dbk61-sandbox"\)/);
 assert.match(s,/if \(sandboxHeader !== null\)/);
 assert.match(s,/createPosManualSale\(body, seller\)/);
 assert.match(s,/createPosMpesaSale\(body, seller\)/);
 assert.match(s,/request\.headers\.get\("origin"\)/);
 assert.match(s,/staff\.role !== "ADMIN"/);
});
test('sandbox requires localhost development and all environment gates',()=>{
 const s=src('lib/db/dbk61-pos-compat.ts');
 for(const x of ['development','DBK58_LOCAL_PREVIEW','DBK60_STAGING_TEST','DBK60_TEST_WRITE','DBK61_LOCAL_POS_COMPAT','localhost'])assert.ok(s.includes(x));
 const sql=src('lib/db/dbk60-pos-staging.ts');
 assert.ok(sql.includes('PINNED_TEST_HOST'));assert.ok(sql.includes('KNOWN_PRODUCTION_HOST'));
 assert.ok(sql.includes('url.hostname === liveHost'));
});
test('receipt and history endpoints protect synthetic sales without leaking into Sanity',()=>{
 for(const path of ['history','receipt','receivables']) {
  const s=src(`app/api/backoffice/pos/${path}/route.ts`);
  assert.match(s,/dbk61SandboxAllowed\(request\)/);assert.match(s,/staff\.role !== "ADMIN"/);
 }
 const r=src('app/api/backoffice/pos/receivables/route.ts');
 assert.match(r,/Test orders cannot receive real payments/);
});
test('sandbox paths never call payment verification, external payment capture, or write Sanity',()=>{
 const s=src('lib/db/dbk61-pos-compat.ts');
 assert.doesNotMatch(s,/serverClient\.(?:create|patch|transaction)/);
 assert.doesNotMatch(s,/fetch\([^)]*paystack/);
 assert.doesNotMatch(s,/initiateDaraja|recordOutstandingCashPayment/);
});
