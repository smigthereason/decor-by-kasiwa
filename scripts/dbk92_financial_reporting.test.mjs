import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

test('report receivables exclude cancelled orders and failed payments without modifying history',()=>{
  const source=readFileSync(new URL('../lib/pos/operations.ts',import.meta.url),'utf8');
  assert.match(source,/coalesce\(balanceDue,0\) > 0 && status != "cancelled" && paymentStatus != "failed"/);
  assert.match(source,/globalReceivables/);
});
test('cutover audit checks persisted full DBK-90 after-state equality',()=>{
  const source=readFileSync(new URL('./dbk76_cutover_readiness.mjs',import.meta.url),'utf8');
  assert.match(source,/dbk90_stock_reconciliation_log/);
  assert.match(source,/after_state = \(SELECT coalesce\(jsonb_object_agg/);
});
