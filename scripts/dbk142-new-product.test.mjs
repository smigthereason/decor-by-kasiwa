import { test } from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dbk142ZeroStockKeys} from '../lib/db/dbk142-new-product-core.ts';

const make = (overrides={}) => ({storeLocationId:'store.main',variantIds:[],initialStock:0,incoming:0,variantStock:[],...overrides});

test('new non-variant product registers the empty variant key at zero',()=> {
  assert.deepEqual(dbk142ZeroStockKeys(make()),['']);
});
test('new variants use distinct existing catalogue keys, never stock totals',()=> {
  assert.deepEqual(dbk142ZeroStockKeys(make({variantIds:['blue1','red1']})),['blue1','red1']);
});
test('new products cannot bypass the zero-stock rule',()=> {
  for(const changes of [{initialStock:5},{incoming:2},{variantStock:[1]}]) {
    assert.throws(()=>dbk142ZeroStockKeys(make(changes)),/zero stock/);
  }
});
test('rejects duplicate, missing, or quarantined variant identities',()=> {
  for(const ids of [['a','a'],['__UNALLOCATED_VARIANT__'],['bad space']]) {
    assert.throws(()=>dbk142ZeroStockKeys(make({variantIds:ids})),/Invalid variant/);
  }
  assert.throws(()=>dbk142ZeroStockKeys(make({storeLocationId:''})),/location/);
});
test('create POST uses guarded zero registration instead of the blanket 409',()=> {
  const api=readFileSync(new URL('../app/api/backoffice/products/route.ts',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../components/backoffice/ProductCreatePage.tsx',import.meta.url),'utf8');
  assert.match(api,/dbk142RegisterZeroStockProduct\(/);
  assert.doesNotMatch(api,/New products require an atomic Neon inventory seed/);
  assert.match(api,/available: neonCreation \? false/);
  assert.match(ui,/form\.set\('createRequestId', createRequestIdRef\.current\)/);
});

test('zero registration never updates existing live stock or creates movement records',()=> {
  const helper=readFileSync(new URL('../lib/db/dbk142-new-product.ts',import.meta.url),'utf8');
  assert.match(helper,/ON CONFLICT \(product_id,variant_id,location_id\) DO NOTHING/);
  assert.doesNotMatch(helper,/UPDATE\s+public\.dbk51_stock_balances/i);
  assert.doesNotMatch(helper,/INSERT\s+INTO\s+public\.dbk51_stock_operations/i);
});
test('retry resumes the original product rather than creating a duplicate',()=> {
  const api=readFileSync(new URL('../app/api/backoffice/products/route.ts',import.meta.url),'utf8');
  assert.match(api,/dbk142CreateRequestId/);
  assert.match(api,/if \(!existing\.product\) \{/);
  assert.match(api,/pendingProductId = productId/);
  assert.match(api,/DBK142_STOCK_REGISTRATION_PENDING/);
});
