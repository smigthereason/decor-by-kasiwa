import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDbk62RealOrderId,mapDBK62History,mapDBK62Receipt,filterDBK62History} from '../lib/db/dbk62-pos-mapper.ts';
const src=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const id='dbk62.order.111111111111111111111111';
const order={
 order_id:id,order_number:'DBK62-POS-111111111111111111111111',store_id:'store.1',seller_id:'staff.1',
 subtotal_minor:'20000',discount_minor:'0',delivery_minor:'0',total_minor:'20000',collected_minor:'10000',
 balance_due_minor:'10000',overpaid_minor:'0',financial_status:'PARTIALLY_PAID',created_at:'2026-10-28T12:00:00Z',
 display_snapshot:{customerName:'Customer',customerPhone:'+254700000000',customerEmail:'',sellerName:'Seller',
  sellerRole:'ADMIN',storeName:'OTC Mall Branch',paymentName:'Payer',paymentReference:'REAL-ABC123',
  internalReference:'DBK-POS-abcdefgh',discountType:'',discountValue:0,discountReason:'',discountAuthorizedByName:'',
  receiptNumber:'RCT-DBK62-POS-111111111111111111111111',productNames:['Vase'],
  lineDetails:[{category:'Decor',unitCost:100}],deliveryLocation:'In-store purchase'},
 lines:[{product_id:'p1',variant_id:'',quantity:1,unit_price_minor:'20000'}],
 payments:[{provider:'manual',provider_reference:'REAL-ABC123',payment_purpose:'INITIAL',amount_minor:'10000'}],
};
test('real Neon history maps KES minor units and customer metadata',()=>{
 const h=mapDBK62History(order);
 assert.equal(h.total,200);assert.equal(h.balanceDue,100);assert.equal(h.paymentStatus,'partially_paid');
 assert.equal(h.customerPhone,'+254700000000');assert.equal(h.lineItems[0].name,'Vase');
 assert.equal(h.paymentReference,'DBK-POS-abcdefgh');assert.equal(h.providerReceiptNumber,'REAL-ABC123');
});
test('real receipt preserves payer, receipt number and customer',()=>{
 const r=mapDBK62Receipt(order);
 assert.equal(r.manualPaymentName,'Payer');assert.equal(r.receiptNumber,order.display_snapshot.receiptNumber);
 assert.equal(r.fulfilmentType,'IN_STORE'); assert.ok(!('testOnly' in r));
});
test('never adopts DBK58 synthetic receipt or invalid minor units',()=>{
 assert.equal(isDbk62RealOrderId('dbk58.order.111111111111111111111111'),false);
 assert.throws(()=>mapDBK62History({...order,order_id:'dbk58.order.111111111111111111111111'}));
 assert.throws(()=>mapDBK62History({...order,total_minor:'-100'}));
 assert.throws(()=>mapDBK62History({...order,total_minor:'9007199254740993'}));
 assert.throws(()=>mapDBK62History({...order,payments:[]}));
});
test('real Neon order filtering handles store, dates and search',()=>{
 const h=mapDBK62History(order);
 assert.equal(filterDBK62History([h],{storeId:'store.2'}).length,0);
 assert.equal(filterDBK62History([h],{query:'vase'}).length,1);
 assert.equal(filterDBK62History([h],{channel:'ONLINE'}).length,0);
 assert.equal(filterDBK62History([h],{from:'2026-10-28',to:'2026-10-28'}).length,1);
 assert.throws(()=>filterDBK62History([h],{from:'2026-10-29',to:'2026-10-28'}));
});
test('production connection and all SQL cutover conditions fail closed by default',()=>{
 const s=src('lib/db/dbk62-pos-cutover.ts');
 for(const term of ['DBK62_POS_BACKEND','DBK62_NEON_READS','DBK62_CUTOVER_APPROVED','PRODUCTION_HOST','TEST_HOST','u.hostname!==PRODUCTION_HOST'])assert.ok(s.includes(term),term);
 const sql=src('migration/dbk62-cutover.sql');
 for(const term of ['enabled boolean NOT NULL DEFAULT false','all_stock_writers_switched','provider_callbacks_ready',
 'receivables_ready','refunds_ready','reports_ready','sanity_stock_frozen','seed_fingerprint = c.reconciliation_fingerprint'])
   assert.ok(sql.includes(term),term);
 assert.match(sql,/v_result := public\.dbk57_record_manual_sale\(p_request_key, p_payload\)/);
 assert.match(sql,/INSERT INTO public\.dbk62_manual_sales/);
 assert.doesNotMatch(sql,/UPDATE public\.dbk51_stock_engine_config SET writes_enabled=true/);
});
test('manual POS never falls back to Sanity if Neon is selected',()=>{
 const s=src('app/api/backoffice/pos/sale/route.ts');
 assert.match(s,/if \(dbk62CutoverRequested\(\)\)/);
 assert.match(s,/await dbk62CreateRealManualSale\(body, seller\)/);
 assert.match(s,/if \(body\.paymentMethod !== "manual"\)/);
});
test('Neon stock is enforced by atomic SQL; Sanity catalogue still validates prices',()=>{
 const s=src('lib/pos/server.ts');
 assert.match(s,/buildLines\(input\.cart,seller,\{stockAuthority:"neon"\}\)/);
 assert.match(s,/options\.stockAuthority === "neon"/);
 assert.match(s,/getQuantityUnitPrice/);
 assert.match(s,/manualPaymentConfirmed !== true/);
});
test('reads integrate legacy history, but refunds, followup payments and reports refuse split writes',()=>{
 for(const name of ['history','receipt','receivables','refunds','reports']) {
  const s=src(`app/api/backoffice/pos/${name}/route.ts`);
  assert.ok(s.includes(name==='refunds'||name==='reports'?'dbk62CutoverRequested':'dbk62ReadEnabled'),name);
 }
 for(const name of ['refunds','receivables','reports']) {
  assert.match(src(`app/api/backoffice/pos/${name}/route.ts`),/status: ?503/);
 }
 assert.match(src('app/api/backoffice/pos/receipt/route.ts'),/Unauthorized receipt location/);
});
test('provider callbacks and checkout remain unmodified in this patch',()=>{
 const sql=src('migration/dbk62-cutover.sql');
 assert.match(sql,/provider_callbacks_ready boolean NOT NULL DEFAULT false/);
 assert.match(sql,/reports_ready boolean NOT NULL DEFAULT false/);
});
