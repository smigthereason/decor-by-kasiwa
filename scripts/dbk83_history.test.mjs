import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeMovementHistory, movementQueryPattern, isHistoricalPurchase, canonicalDocument, validateRestorableMovement } from '../lib/inventory/dbk83-history-core.ts';
const row = (id, date, extra={}) => ({_id:id,createdAt:date,...extra});
test('merges archived and current movements in descending order',()=>{
 const r=mergeMovementHistory([row('a','2026-10-30T12:00:00Z')],[row('b','2026-10-29T12:00:00Z')],[],0);
 assert.deepEqual(r.movements.map(x=>x._id),['a','b']);
});
test('deduplicates and prefers currently live Sanity revisions',()=>{
 const r=mergeMovementHistory([row('a','2026-10-29T12:00:00Z',{_rev:'r2'})],[row('a','2026-10-29T12:00:00Z',{_rev:'r1',archived:true})],[],0);
 assert.equal(r.movements.length,1); assert.equal(r.movements[0]._rev,'r2'); assert.notEqual(r.movements[0].archived,true);
});
test('pagination across both ledgers stays stable',()=>{
 const live=[row('f','2026-10-30T12:00:00Z'),row('c','2026-10-20T12:00:00Z')];
 const archived=[row('e','2026-10-29T12:00:00Z'),row('d','2026-10-25T12:00:00Z'),row('b','2026-10-15T12:00:00Z'),row('a','2026-10-10T12:00:00Z')];
 const p1=mergeMovementHistory(live,archived,[],0,3),p2=mergeMovementHistory(live,archived,[],3,3);
 assert.deepEqual(p1.movements.map(x=>x._id),['f','e','d']); assert.equal(p1.hasMore,true);
 assert.deepEqual(p2.movements.map(x=>x._id),['c','b','a']);assert.equal(p2.hasMore,false);
});
test('current Sanity record overrides stale archive when record was corrected',()=>{
 const r=mergeMovementHistory([row('x','2026-10-30',{correctedQuantity:0})],[row('x','2026-10-30',{correctedQuantity:50})],[],0);
 assert.equal(r.movements[0].correctedQuantity,0);
});
test('SQL search uses sanitized token sequence',()=>{
 assert.equal(movementQueryPattern('Blue / wind!'),'%blue%wind%'); assert.equal(movementQueryPattern(''), '');
 assert.equal(movementQueryPattern('100%'),'%100%');
});
test('legacy receipts without incomingBefore are counted in purchase analytics',()=>{
 assert.equal(isHistoricalPurchase({movementType:'RECEIPT'}),true);
 assert.equal(isHistoricalPurchase({movementType:'RECEIPT',incomingBefore:0}),false);
 assert.equal(isHistoricalPurchase({movementType:'PURCHASE'}),true);
});
test('canonical hash input normalizes key ordering deeply',()=>{
 assert.deepEqual(canonicalDocument({b:{y:1,x:2},a:1}),{a:1,b:{x:2,y:1}});
});
test('only authenticated archive identity can be restored',()=>{
 const v={_id:'inventoryMovement.abc',_rev:'a',_type:'inventoryMovement',movementType:'PURCHASE',productId:'product.abc',createdAt:'2026-10-01T00:00:00Z',_createdAt:'2026-10-01T00:00:00Z'};
 assert.ok(validateRestorableMovement(v,v._id,v._rev));
 assert.throws(()=>validateRestorableMovement(v,v._id,'wrong')); assert.throws(()=>validateRestorableMovement({...v,productId:null},v._id,v._rev));
});
