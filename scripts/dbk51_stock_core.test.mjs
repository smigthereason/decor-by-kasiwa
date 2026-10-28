import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStockSnapshot, UNALLOCATED, UNKNOWN_VARIANT } from './dbk51_stock_core.mjs';
const prod = { _id:'p1',_rev:'p-r1',_type:'product',initialStock:10 };
const inv = { _id:'inv1',_rev:'i-r1',_type:'inventoryRecord', product:{_ref:'p1'}, incoming:3,
  locationBalances:[{store:{_ref:'main'},onHand:6,incoming:2}] };

test('non-variant assigned and unallocated balances preserve company totals',()=>{
  const p = buildStockSnapshot([prod,inv]);
  assert.equal(p.safeToSeed,true);
  assert.deepEqual(p.quantityTotals,{onHand:10,incoming:3});
  assert.equal(p.rows.find(r=>r.location_id===UNALLOCATED).on_hand,4);
  assert.equal(p.rows.find(r=>r.location_id===UNALLOCATED).incoming,1);
});
test('deterministic fingerprint regardless of export document order',()=>{
  assert.equal(buildStockSnapshot([prod,inv]).fingerprint,buildStockSnapshot([inv,prod]).fingerprint);
});
test('fails closed on negative allocated/stock mismatch',()=>{
  const p=buildStockSnapshot([prod,{...inv,locationBalances:[{store:{_ref:'main'},onHand:11,incoming:2}]}]);
  assert.equal(p.safeToSeed,false);
  assert.match(p.problems.join(' '),/exceeds company/);
});
test('fails closed when incoming at stores exceeds company total',()=>{
  const p=buildStockSnapshot([prod,{...inv,incoming:1}]);
  assert.equal(p.safeToSeed,false);
});
test('fails closed on duplicate inventory documents',()=>{
  const p=buildStockSnapshot([prod,inv,{...inv,_id:'inv2'}]);
  assert.equal(p.safeToSeed,false);
});
test('variant balances reconcile individually and unknown incoming is held separate',()=>{
  const p=buildStockSnapshot([
    {...prod,variants:[{_key:'red',stockQuantity:7},{_key:'blue',stockQuantity:3}]},
    {...inv,locationBalances:[{store:{_ref:'main'},onHand:5,incoming:1, variants:[{variantId:'red',onHand:4,incoming:1},{variantId:'blue',onHand:1,incoming:0}]}]}
  ]);
  assert.equal(p.safeToSeed,true, p.problems.join('\n'));
  assert.deepEqual(p.quantityTotals,{onHand:10,incoming:3});
  assert.equal(p.rows.find(r=>r.variant_id===UNKNOWN_VARIANT).incoming,2);
});
test('fails closed on variant aggregate mismatch',()=>{
  const p=buildStockSnapshot([
    {...prod,variants:[{_key:'red',stockQuantity:7}]},
    {...inv,locationBalances:[{store:{_ref:'main'},onHand:5,incoming:2,variants:[{variantId:'red',onHand:4,incoming:2}]}]}
  ]);
  assert.equal(p.safeToSeed,false);
});
test('fails closed on fractional stock amounts',()=>{
  const p=buildStockSnapshot([{...prod,initialStock:3.5}]);
  assert.equal(p.safeToSeed,false);
});
test('does not include Sanity draft quantities in published snapshot',()=>{
  const p=buildStockSnapshot([prod,{...prod,_id:'drafts.p1',initialStock:900},inv]);
  assert.equal(p.quantityTotals.onHand,10);
});
test('does not seed inventory without a product',()=>{
  const p=buildStockSnapshot([inv]);
  assert.equal(p.safeToSeed,false);
});


test('unidentified onHand is quarantined without reassigning variants or making it store-sellable',()=>{
  const p = buildStockSnapshot([
    {...prod, name:'Example vase', variants:[{_key:'bronze',stockQuantity:6},{_key:'black',stockQuantity:4}]},
    {...inv, unallocatedOnHand:3, incoming:2,
      locationBalances:[{store:{_ref:'main'},onHand:7,incoming:1, variants:[
        {variantId:'bronze',onHand:5,incoming:1},
        {variantId:'black',onHand:2,incoming:0},
      ]}]},
  ]);
  assert.equal(p.safeToSeed,true,p.problems.join('\n'));
  const unknown = p.rows.filter(r=>r.variant_id===UNKNOWN_VARIANT);
  assert.equal(unknown.length,1);
  assert.equal(unknown[0].location_id,UNALLOCATED);
  assert.equal(unknown[0].on_hand,3);
  assert.equal(unknown[0].incoming,1);
  assert.deepEqual(p.quantityClassification, {
    storeSellableOnHand:7,knownVariantUnallocatedOnHand:3,quarantinedOnHand:3,
  });
  assert.equal(p.quantityTotals.onHand,13);
  assert.equal(p.quarantinedProducts[0].productName,'Example vase');
});

test('invalid unidentified quantities still fail closed',()=>{
  const p = buildStockSnapshot([
    {...prod,variants:[{_key:'red',stockQuantity:10}]},
    {...inv,unallocatedOnHand:1.5,locationBalances:[]},
  ]);
  assert.equal(p.safeToSeed,false);
  assert.match(p.problems.join(' '),/expected a non-negative whole number/);
});

test('known variant stock is never mixed into reserved unknown variant bucket',()=>{
  const p = buildStockSnapshot([
    {...prod,variants:[{_key:'v',stockQuantity:10}]},
    {...inv,unallocatedOnHand:2,incoming:0,locationBalances:[]},
  ]);
  assert.equal(p.safeToSeed,true,p.problems.join('\n'));
  assert.equal(p.rows.find(r=>r.variant_id==='v').on_hand,10);
  assert.equal(p.rows.find(r=>r.variant_id===UNKNOWN_VARIANT).on_hand,2);
  assert.equal(p.quantityClassification.storeSellableOnHand,0);
});
