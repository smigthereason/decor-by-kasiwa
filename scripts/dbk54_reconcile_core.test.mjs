import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileRows} from './dbk54_reconcile_core.mjs';
const a=(product_id,variant_id,location_id,on_hand,incoming=0)=>({product_id,variant_id,location_id,on_hand,incoming});
test('identical rows ignoring order and numeric PG strings compare equally',()=>{
  const x=[a('p1','','store-a',10,2),a('p1','v','__UNALLOCATED__',3)];
  const y=[a('p1','v','__UNALLOCATED__','3'),a('p1','','store-a','10','2')];
  assert.equal(reconcileRows(x,y).inSync,true);
});
test('changed stock, removed variant, added product and incoming tracked without hiding delta',()=>{
  const report=reconcileRows([a('p1','','a',8),a('p2','v','a',2),a('p3','','a',3)],
    [a('p1','','a','10'),a('p2','v','a','2'),a('p4','','a','5')]);
  assert.equal(report.inSync,false); assert.equal(report.changedRows,1);
  assert.equal(report.addedInSanity,1); assert.equal(report.missingInSanity,1);
  assert.equal(report.stockDifference,-4);
});
test('quarantined variant is not silently ignored',()=>{
  const r=reconcileRows([a('p1','__UNALLOCATED_VARIANT__','__UNALLOCATED__',475)],
    [a('p1','__UNALLOCATED_VARIANT__','__UNALLOCATED__',474)]);
  assert.equal(r.changeCount,1); assert.equal(r.stockDifference,1);
});
test('reject duplicate or invalid quantities (including large bigint)',()=>{
  assert.throws(()=>reconcileRows([a('p','','a',1),a('p','','a',2)],[]),/duplicate/);
  assert.throws(()=>reconcileRows([a('p','','a',-1)],[]),/Invalid/);
  assert.throws(()=>reconcileRows([a('p','','a','9223372036854775807')],[]),/Invalid/);
});
