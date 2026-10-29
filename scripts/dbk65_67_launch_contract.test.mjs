import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isNeonOnlineOrderId,mapNeonOrder,mapNeonShipment} from '../lib/db/dbk65-online-fulfilment-core.ts';
const read=x=>readFileSync(new URL(x,import.meta.url),'utf8');
const ref='DBK64-1790000000000-abcdef1234';
const mk=()=>({order_id:`dbk64.order.${ref}`,reference:ref,order_number:'DBK-COM-REPLAY1',store_id:'store.a',amount_minor:'20000',
  payment_status:'PAID',stock_status:'COMMITTED',provider_transaction_id:'7890',
  created_at:'2026-10-28T12:00:00Z',updated_at:'2026-10-28T12:01:00Z',paid_at:'2026-10-28T12:01:00Z',
  snapshot:{orderId:`dbk64.order.${ref}`,reference:ref,orderNumber:'DBK-COM-REPLAY1',storeId:'store.a',storeName:'Test Store',
    customerName:'Test Buyer',customerEmail:'test@example.com',customerPhone:'0700000000',paymentChannel:'card',
    subtotalMinor:18000,deliveryMinor:2000,totalMinor:20000,deliveryAddress:{fullName:'Test Buyer',phone:'0700000000',address1:'Road',city:'Nairobi',region:'Nairobi',country:'Kenya'},
    deliveryLocation:'Nairobi',lines:[{productId:'p1',variantId:'',name:'Vase',quantity:2,unitPriceMinor:9000}]},
  fulfilment_status:'packed',fulfilment_updated_at:null,dispatched_at:null,dispatched_by_name:null,delivered_at:null});
test('online reference cannot overlap POS or synthetic references',()=>{
 assert(isNeonOnlineOrderId(`dbk64.order.${ref}`));assert(!isNeonOnlineOrderId('dbk58.order.fake'));
});
test('maps paid inventory-committed checkout and shipment with exact cents',()=>{
 const o=mapNeonOrder(mk());const s=mapNeonShipment(mk());assert.equal(o.total,200);assert.equal(o.paymentStatus,'paid');
 assert.equal(o.status,'packed');assert.equal(s?.totalUnits,2);assert.equal(s?.orderId,o.id);
});
test('paid but failed-stock order cannot enter the fulfilment queue',()=>{
 const r=mk();r.stock_status='REVIEW_REQUIRED';assert.match(mapNeonOrder(r).customerNote,/DO NOT DISPATCH/);assert.equal(mapNeonShipment(r),null);
});
test('unpaid orders are not eligible for dispatch or shipment',()=>{
 const r=mk();r.payment_status='PENDING';assert.equal(mapNeonOrder(r).status,'pending');assert.equal(mapNeonShipment(r),null);
});
test('identity and order totals mismatch reject rather than disappear',()=>{
 const a=mk();a.amount_minor='19000';assert.throws(()=>mapNeonOrder(a),/identity or amount/);
 const b=mk();b.order_id='commerceOrder.legacy';assert.throws(()=>mapNeonOrder(b));
});
test('live order and shipment directories include Neon when reads enabled',()=>{
 const src=read('../lib/operations/live.ts');assert(src.includes('dbk65ListOnlineOrders(storeLocationId)'));
 assert(src.includes('dbk65ListOnlineShipments(storeLocationId)'));
});
test('existing Sanity order routes never touch a Neon-prefixed ID',()=>{
 for(const route of ['../app/api/backoffice/orders/[id]/route.ts','../app/api/backoffice/orders/[id]/dispatch/route.ts']){
  const src=read(route);assert(src.includes('isNeonOnlineOrderId(orderId)'));
  assert(src.indexOf('isNeonOnlineOrderId(orderId)')<src.indexOf('serverClient.fetch'));
 }
});
test('fulfilment SQL defaults disabled, requires payment and stock and serializes transitions',()=>{
 const src=read('../migration/dbk65-online-fulfilment.sql');
 assert(src.includes('DEFAULT false'));assert(src.includes("v_order.payment_status<>'PAID'"));
 assert(src.includes("v_order.stock_status<>'COMMITTED'"));assert(src.includes('pg_advisory_xact_lock'));
});
test('READONLY quota audit has no destructive endpoints',()=>{
 const src=read('../scripts/dbk67_sanity_quota_audit.mjs');
 assert(src.includes('count(*[])'));assert(!src.includes('mutate/'));assert(!src.includes('dataset delete'));
});
