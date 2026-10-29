import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dbk69OverlayStock,DBK69_UNALLOCATED,DBK69_QUARANTINED } from '../lib/db/dbk69-inventory-core.ts';
const read = name => fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const sample = [{product_id:'p',variant_id:'',location_id:'storeA',on_hand:'6',incoming:'2'},
  {product_id:'p',variant_id:'',location_id:DBK69_UNALLOCATED,on_hand:'4',incoming:'1'},
  {product_id:'p',variant_id:DBK69_QUARANTINED,location_id:'storeA',on_hand:'475',incoming:'0'}];
test('Neon stock overrides Sanity but quarantined inventory is not sellable',()=>{
  const s=dbk69OverlayStock({id:'p',onHand:999,incoming:0,available:true},sample,'storeA');
  assert.equal(s.onHand,6);assert.equal(s.incoming,2);assert.equal(s.companyOnHand,10);
  assert.equal(s.unallocatedOnHand,4);assert.equal(s.locationBalances?.[0].onHand,6);
});
test('Quarantine-only products display zero sellable inventory, not an error or Sanity stock',()=>{
  const s=dbk69OverlayStock({id:'p',onHand:475,incoming:0,available:true},[{product_id:'p',variant_id:DBK69_QUARANTINED,location_id:DBK69_UNALLOCATED,on_hand:'475',incoming:'0'}]);
  assert.equal(s.onHand,0);assert.equal(s.available,false);assert.equal(s.companyOnHand,0);
});
test('Unknown product and inconsistent variant must not fall back to Sanity',()=>{
  assert.throws(()=>dbk69OverlayStock({id:'p',onHand:50,incoming:0},[]),/absent/);
  assert.throws(()=>dbk69OverlayStock({id:'p',onHand:50,incoming:0,variants:[{id:'real',stockQuantity:4}]},sample),/variants/);
});
test('Variant stock by branch and company is based only on known variant rows',()=>{
  const b=[{product_id:'p',variant_id:'v1',location_id:'A',on_hand:2,incoming:1},
   {product_id:'p',variant_id:'v1',location_id:'B',on_hand:4,incoming:0},
   {product_id:'p',variant_id:'v2',location_id:'A',on_hand:1,incoming:0}];
  const item={id:'p',onHand:100,incoming:0,variants:[{id:'v1',stockQuantity:99},{id:'v2',stockQuantity:99}]};
  const A=dbk69OverlayStock(item,b,'A');
  assert.equal(A.companyOnHand,7);assert.equal(A.onHand,3);assert.deepEqual(A.variants?.map(x=>x.stockQuantity),[2,1]);
  const all=dbk69OverlayStock(item,b);
  assert.deepEqual(all.variants?.map(x=>x.stockQuantity),[6,1]);
});
test('Invalid negative, fractional, and overflowing quantities stop display',()=>{
  for(const bad of ['-1','1.3','9007199254740993']) {
    assert.throws(()=>dbk69OverlayStock({id:'p',onHand:0,incoming:0},[{product_id:'p',variant_id:'',location_id:'A',on_hand:bad,incoming:0}]),/Invalid Neon stock balance/);
  }
});
test('Single transaction wraps original DBK51 operation and immutable movement metadata',()=>{
  const sql=read('migration/dbk69-inventory-authority.sql');
  assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql,/dbk51_apply_stock\(p_id,p_payload\)/);
  assert.match(sql,/INSERT INTO public\.dbk69_inventory_movements/);
  assert.match(sql,/pg_advisory_xact_lock/);
  assert.match(sql,/request_payload <> p_payload OR v_existing\.metadata <> p_meta/);
  assert.match(sql,/REVOKE ALL ON FUNCTION public\.dbk69_apply_inventory/);
});
test('Neon authority cannot call old Sanity stock writers, or edit/deletes from product catalogue',()=>{
  const api=read('app/api/backoffice/inventory/movements/route.ts');
  assert.match(api,/if \(dbk69InventoryEnabled\(\)\) \{[\s\S]*?dbk69ApplyAdminOperation/);
  assert.match(api,/Historical movement corrections are blocked/);
  assert.match(read('app/api/backoffice/products/route.ts'),/New products require an atomic Neon inventory seed/);
  assert.match(read('app/api/backoffice/products/[id]/route.ts'),/Product deletion is blocked/);
  assert.match(read('app/api/backoffice/products/[id]/route.ts'),/Stock, variants and inventory location changes must use the Neon ledger/);
});
test('Browser uses stable operation UUID across an identical retry',()=>{
  const ui=read('components/backoffice/InventoryManagementPage.tsx');
  assert.match(ui,/pendingMovement\.current\?\.signature !== signature/);
  assert.match(ui,/crypto\.randomUUID\(\)/);
  assert.match(ui,/operationId:pendingMovement\.current\.operationId/);
});
test('Store and POS catalogue read Neon balances, not stale Sanity stock after authority switch',()=>{
  const cat=read('sanity/lib/catalog.ts');
  assert.match(cat,/if \(dbk69InventoryEnabled\(\)\) \{[\s\S]*?return products\.map\(product => withNeonCatalogBalance/);
  assert.match(read('lib/operations/live.ts'),/dbk69OverlayStock\(mapped/);
});
