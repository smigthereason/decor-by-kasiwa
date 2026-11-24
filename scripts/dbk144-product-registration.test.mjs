import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dbk142ZeroStockKeys} from '../lib/db/dbk142-new-product-core.ts';

test('non-variant product normalizes to one empty stock identity',()=> {
  assert.deepEqual(dbk142ZeroStockKeys({storeLocationId:'store.main',variantIds:[],initialStock:0,incoming:0,variantStock:[]}),['']);
});
test('creation route never feeds normalized stock keys into the second validator',()=> {
  const api = readFileSync(new URL('../app/api/backoffice/products/route.ts',import.meta.url),'utf8');
  assert.match(api,/variantIds:saved\.product\.variantKeys \|\| \[\]/);
  assert.doesNotMatch(api,/const variantKeys = dbk142ZeroStockKeys\(/);
});
test('one-time repair cannot overwrite balances, adjust payments or publish the product',()=> {
  const file = readFileSync(new URL('./dbk144-repair-pending-product.mjs',import.meta.url),'utf8');
  assert.match(file,/ON CONFLICT \(product_id,variant_id,location_id\) DO NOTHING/);
  assert.doesNotMatch(file,/UPDATE\s+public\.dbk51_stock_balances/i);
  assert.doesNotMatch(file,/DELETE\s+FROM\s+public\.dbk51_stock_balances/i);
  assert.doesNotMatch(file,/\.set\(\{available:true\}\)/);
  assert.match(file,/const apply = process\.argv\.slice\(2\)\.includes\('--apply'\)/);
});
