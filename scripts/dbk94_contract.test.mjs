import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get = (path) => readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('sale journal is opt-in and pinned to production Neon',()=>{
  const src=get('lib/pos/dbk94-sales-movement.ts');
  assert.match(src,/DBK94_SALE_MOVEMENT_STORE/);
  assert.match(src,/DBK94_SALE_MOVEMENT_APPROVED/);
  assert.match(src,/ep-steep-scene-bausr4ct-pooler/);
});
test('sale stock mutations remain in the Sanity transaction',()=>{
  const src=get('lib/pos/server.ts');
  assert.match(src,/transaction\.patch\(product\._id/);
  assert.match(src,/transaction\.patch\(inventoryId/);
});
test('Neon movement projection does not call stock-affecting functions',()=>{
  const src=get('lib/db/dbk94-project-sale-movements.ts');
  assert.doesNotMatch(src,/dbk51_apply_stock|dbk54_apply_stock_batch|dbk62_record_real_manual_sale/);
  assert.match(src,/ON CONFLICT \(movement_id\) DO NOTHING/);
});
test('Sanity SALE movement document routing is opt-in only',()=>{
  const src=get('lib/pos/ledger.ts');
  assert.match(src,/movementType === "SALE" && dbk94NeonSalesEnabled\(\)/);
  assert.match(src,/transaction\.createIfNotExists/);
});
test('M-Pesa, manual POS and Paystack sales have durable journal pathway',()=>{
  const pos=get('lib/pos/server.ts'), online=get('lib/paystack/server.ts');
  assert.match(pos,/dbk94SaleMovementJournal:dbk94Journal/);
  assert.match(pos,/dbk94JournalOnExistingOrder/);
  assert.match(online,/dbk94JournalOnExistingOrder/);
  assert.match(online,/dbk94ProjectAfterCommit/);
});
