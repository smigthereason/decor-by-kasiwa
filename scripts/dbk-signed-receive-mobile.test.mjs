import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryQuantityFromMagnitude } from '../lib/inventory/receive-quantity.ts';

test('phone: entering 32 and selecting Reduce sends signed -32', () => {
  assert.equal(inventoryQuantityFromMagnitude('32', true), -32);
  assert.equal(278 + inventoryQuantityFromMagnitude('32', true), 246);
});
test('receipt remains positive with the same numeric keyboard', () => {
  assert.equal(inventoryQuantityFromMagnitude('32', false), 32);
});
test('rejects empty, zero, fractions, signs, text and huge values', () => {
  for (const value of ['', '0', '-32', '+32', '2.5', 'abc', '99999999999999']) {
    assert.equal(inventoryQuantityFromMagnitude(value, true), null, `Rejected: ${value}`);
  }
});
test('incoming remains unchanged for a reduction', () => {
  const incoming = 0;
  const reduction = inventoryQuantityFromMagnitude('32', true);
  assert.equal(reduction, -32);
  assert.equal(reduction > 0 ? incoming - reduction : incoming, 0);
});
