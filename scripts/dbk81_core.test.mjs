import test from 'node:test';
import assert from 'node:assert/strict';
import {planCorrection,ADJUSTMENTS,PRODUCT_ID,STORE_ID,auditId} from './dbk81_core.mjs';
const fixture=()=>({product:{_id:PRODUCT_ID,_type:'product',name:'Mini Scented Candle',_rev:'prod-r1',initialStock:575,
  variants:ADJUSTMENTS.map(a=>({_key:a.key,title:a.label,stockQuantity:a.before,price:250}))},
  inventoryRecords:[{_id:'inventory.'+PRODUCT_ID,_type:'inventoryRecord',product:{_ref:PRODUCT_ID},_rev:'inv-r1',incoming:0,reserved:0,
    locationBalances:[{storeId:STORE_ID,onHand:575,incoming:0,variants:ADJUSTMENTS.map(a=>({variantId:a.key,onHand:a.before,incoming:0,variantLabel:a.label}))}]}],
  movements:ADJUSTMENTS.flatMap(a=>[{movementType:'PURCHASE',variantId:a.key,quantityChange:a.opening,stockBefore:288},
    {movementType:'RECEIPT',variantId:a.key,quantityChange:a.opening}]),priorAudit:[]});
test('corrects duplicated 288 opening units but preserves the later 1-unit sale',()=>{
  const plan=planCorrection(fixture());assert.equal(plan.before,575);assert.equal(plan.after,287);assert.equal(plan.duplicateOpening,288);
  assert.deepEqual(plan.nextVariants.map(v=>v.stockQuantity),[137,50,50,50]);
  assert.equal(plan.nextLocationBalances[0].onHand,287);assert.equal(plan.nextLocationBalances[0].variants.reduce((a,v)=>a+v.onHand,0),287);
});
test('refuses changed stock instead of erasing current business transactions',()=>{const x=fixture();x.product.variants[0].stockQuantity--;assert.throws(()=>planCorrection(x),/STOP/)});
test('refuses unverified purchase or receipt proof',()=>{const x=fixture();x.movements=x.movements.filter(v=>!(v.variantId===ADJUSTMENTS[1].key&&v.movementType==='RECEIPT'));assert.throws(()=>planCorrection(x),/STOP/)});
test('refuses unmatched company and branch totals',()=>{const x=fixture();x.inventoryRecords[0].locationBalances[0].onHand=576;assert.throws(()=>planCorrection(x),/STOP/)});
test('refuses unexpected new or missing variants',()=>{const x=fixture();x.product.variants.push({_key:'new',title:'new',stockQuantity:1});assert.throws(()=>planCorrection(x),/STOP/)});
test('refuses to apply twice after adjustment movement exists',()=>{const x=fixture();x.priorAudit=[{_id:auditId(ADJUSTMENTS[0].key)}];assert.throws(()=>planCorrection(x),/STOP/)});
test('rejects new incoming or reserved stock',()=>{const x=fixture();x.inventoryRecords[0].incoming=10;assert.throws(()=>planCorrection(x),/STOP/)});
test('ignores fully voided historical test purchase/receipt',()=>{const x=fixture();x.movements.push({movementType:'PURCHASE',variantId:ADJUSTMENTS[3].key,quantityChange:10,correctedQuantity:0,voidedAt:'now'});assert.equal(planCorrection(x).after,287)});
