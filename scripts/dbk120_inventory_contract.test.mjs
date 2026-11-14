import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dbk120InventoryFailure} from '../lib/db/dbk120-inventory-errors.ts';
const read = name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('Stock errors become action-specific errors rather than leaking SQL',()=>{
  assert.deepEqual(dbk120InventoryFailure(new Error('Insufficient purchased/incoming stock')),{status:409,code:'INSUFFICIENT_INCOMING',message:'There are not enough purchased units awaiting receipt at this store. Record a purchase first, then receive the available incoming units.'});
  assert.equal(dbk120InventoryFailure(new Error('Product/variant is absent from seeded stock')).code,'NEON_VARIANT_MISSING');
  assert.equal(dbk120InventoryFailure(new Error('Insufficient stock at source location')).status,409);
  assert.equal(dbk120InventoryFailure(new Error('database host mismatch')).status,503);
  assert.equal(dbk120InventoryFailure(new Error('password=secret')).code,'INVENTORY_WRITE_FAILED');
});
test('Variant editor keeps the Neon stock block and uses zero registration',()=>{
  const p=read('app/api/backoffice/products/[id]/route.ts');
  assert.match(p,/Stock, variants and inventory location changes must use the Neon ledger/);
  assert.match(p,/dbk120RegisterCatalogueVariants\(productId, dbk120DesiredVariantKeys\)/);
  assert.match(p,/!neonInventory && staff\.role !== "MANAGER" && \(productPatch\.initialStock/);
  assert.match(p,/Existing variants cannot be removed after Neon cutover/);
  assert.match(p,/New variants must start with zero stock/);
  assert.match(p,/ifRevisionId\(stockProductRevision\)/);
});
test('Neon variant registration never resets a stocked balance',()=>{
  const ddl=read('migration/dbk120-variant-catalogue-register.sql');
  assert.match(ddl,/pg_advisory_xact_lock\(hashtextextended\('dbk51:'/);
  assert.match(ddl,/ON CONFLICT\(product_id,variant_id,location_id\) DO NOTHING/);
  assert.match(ddl,/on_hand=0 AND incoming=0/);
  assert.doesNotMatch(ddl,/TRUNCATE|UPDATE\s+public\.dbk51_stock_balances|DELETE\s+FROM\s+public\.dbk51_stock_operations/i);
  assert.match(ddl,/REVOKE ALL ON FUNCTION public\.dbk120_register_catalogue_variants/);
});
test('Mobile and desktop edit form do not post quantity totals in Neon mode',()=>{
  const p=read('components/backoffice/ProductCreatePage.tsx');
  assert.match(p,/for \(const key of \["initialStock", "onHand", "incoming"/);
  assert.match(p,/!managerMode && !neonInventory/);
});

test('Zero-only orphan keys may be hidden during safe variant registration; stocked mismatches still fail',async()=>{
  const {dbk69OverlayStock}=await import('../lib/db/dbk69-inventory-core.ts');
  const product={id:'p',onHand:0,incoming:0,variants:[{id:'new',stockQuantity:0}]};
  const safe=dbk69OverlayStock(product,[{product_id:'p',variant_id:'',location_id:'__UNALLOCATED__',on_hand:'0',incoming:'0'}]);
  assert.equal(safe.onHand,0);
  assert.throws(()=>dbk69OverlayStock(product,[{product_id:'p',variant_id:'',location_id:'A',on_hand:'1',incoming:'0'}]),/reconciliation required/);
});
