import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { callbackProvider, isWriteMethod, isPausedPage, validateQueuedBody } from '../lib/maintenance/dbk74-core.ts';
test('only two explicit callback paths can be queued',()=>{
  assert.equal(callbackProvider('/api/paystack/webhook'),'paystack');
  assert.equal(callbackProvider('/api/payments/mobile/callback'),'daraja');
  assert.equal(callbackProvider('/api/backoffice/pos/sale'),null);
});
test('all mutation HTTP methods are blocked during freeze',()=>{
  for(const m of ['POST','PATCH','PUT','DELETE'])assert.equal(isWriteMethod(m),true);
  for(const m of ['GET','HEAD','OPTIONS'])assert.equal(isWriteMethod(m),false);
});
test('checkout and POS pages show maintenance',()=>{
  assert.ok(isPausedPage('/checkout'));
  assert.ok(isPausedPage('/admin/pos/operations'));
  assert.ok(isPausedPage('/store/pos'));
  assert.ok(!isPausedPage('/maintenance'));
});
test('non-callback or malformed payload never enters queue',()=>{
  assert.equal(validateQueuedBody('paystack','{}'),false);
  assert.equal(validateQueuedBody('daraja','{}'),false);
  assert.equal(validateQueuedBody('paystack',JSON.stringify({event:'charge.success',data:{reference:'abc'}})),true);
  assert.equal(validateQueuedBody('daraja',JSON.stringify({Body:{stkCallback:{CheckoutRequestID:'x'}}})),true);
});
