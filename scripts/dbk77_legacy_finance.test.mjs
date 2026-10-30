import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {
 dbk77LegacyFinanceEnabled,dbk77RequireSameOriginJson,
 dbk77ValidateCollection,dbk77ValidateLegacyRefund
} from '../lib/pos/dbk77-legacy-finance-core.ts';
const collection=()=>({amount:123.45,manualPaymentConfirmed:true,paymentReference:'REALRECEIPT1234',requestId:'retail-request-1234'});
const refund=()=>({refundAmount:25,restock:false,cancelOutstanding:false,items:[],manualRefundConfirmed:true,manualRefundReference:'REFUNDRECEIPT1234'});
test('only an explicitly enabled post-cutover bridge is accessible',()=>{
 assert.equal(dbk77LegacyFinanceEnabled(true,'YES'),true);
 for(const [cutover,flag] of [[false,'YES'],[true,'yes'],[true,undefined]]) assert.equal(dbk77LegacyFinanceEnabled(cutover,flag),false);
});
test('requires same-origin JSON for historic financial mutation',()=>{
 const request=new Request('https://site.example/api/pos',{
  method:'POST',headers:{origin:'https://site.example','content-type':'application/json'}});
 assert.doesNotThrow(()=>dbk77RequireSameOriginJson(request));
 for(const origin of ['https://attacker.example',undefined]){
  const r=new Request('https://site.example/api/pos',{method:'POST',headers:origin?{origin,'content-type':'application/json'}:{'content-type':'application/json'}});
  assert.throws(()=>dbk77RequireSameOriginJson(r),/Same-origin/);
 }
});
test('validates confirmed exact-money collections with external reference',()=>{
 assert.deepEqual(dbk77ValidateCollection(collection()),{
  amount:123.45,paymentReference:'REALRECEIPT1234',requestId:'retail-request-1234'});
 for (const x of [
  {manualPaymentConfirmed:false},{amount:-5},{amount:1.999},{paymentReference:'TEST-123456'},
  {paymentReference:''},{requestId:'no'},{requestId:undefined}
 ]) assert.throws(()=>dbk77ValidateCollection({...collection(),...x}));
});
test('legacy bridge rejects all stock returns and debt cancellations',()=>{
 assert.doesNotThrow(()=>dbk77ValidateLegacyRefund(refund()));
 for (const x of [
  {restock:true},{cancelOutstanding:true},{items:[{productId:'a',quantity:1}]},
  {refundAmount:0},{refundAmount:5.999},{manualRefundConfirmed:false},
  {manualRefundReference:'TEST1234567'},{manualRefundReference:undefined}
 ]) assert.throws(()=>dbk77ValidateLegacyRefund({...refund(),...x}));
});
test('legacy payment uses atomic revision compare and strict unique create',()=>{
 const src=readFileSync(new URL('../lib/pos/server.ts',import.meta.url),'utf8');
 assert.match(src,/transaction\.patch\(order\._id, \(patch\) => patch\.ifRevisionId\(order\._rev\)/);
 assert.match(src,/if \(strictCreate\) transaction\.create\(record\)/);
 assert.match(src,/DBK77-LEGACY-/);
 assert.match(src,/providerReceiptNumber:legacyBridge\?\.reference/);
});
test('legacy refund checks payment provider before any external request',()=>{
 const src=readFileSync(new URL('../lib/pos/operations.ts',import.meta.url),'utf8');
 assert.match(src,/legacyBridge && \(input\.restock/);
 assert.match(src,/order\.paymentProvider\?\.toLowerCase\(\) === 'paystack'/);
});
test('production routes remain fail closed without bridge flag',()=>{
 for(const path of ['receivables','refunds']){
  const src=readFileSync(new URL(`../app/api/backoffice/pos/${path}/route.ts`,import.meta.url),'utf8');
  assert.match(src,/DBK77_LEGACY_FINANCE_BRIDGE/);
  assert.match(src,/dbk77RequireSameOriginJson\(request\)/);
  assert.match(src,/dbk62CutoverRequested\(\) && !legacyBridge/);
 }
});
test('cashier UI explicitly confirms money and sends unique payment evidence',()=>{
 const src=readFileSync(new URL('../components/backoffice/PosOperationsPage.tsx',import.meta.url),'utf8');
 assert.match(src,/manualPaymentConfirmed: true, paymentReference, requestId/);
 assert.match(src,/window\.crypto\.randomUUID\(\)/);
 assert.match(src,/Record confirmed payment/);
});
