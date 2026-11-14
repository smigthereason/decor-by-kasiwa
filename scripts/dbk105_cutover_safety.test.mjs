import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dbk68ReplayCartMatches } from '../lib/db/dbk68-daraja-core.ts';
const source = relative => readFileSync(new URL(relative, import.meta.url),'utf8');

test('M-Pesa retry must match product, variant and quantity',()=>{
  const original=[{productId:'p1',variantId:'red',quantity:2},
    {productId:'p1',variantId:'blue',quantity:1}];
  assert.equal(dbk68ReplayCartMatches(original,[...original].reverse()),true);
  assert.equal(dbk68ReplayCartMatches([{productId:'p1',variantId:'red',quantity:1},
    {productId:'p1',variantId:'blue',quantity:2}],original),false);
  assert.equal(dbk68ReplayCartMatches([{productId:'p1',variantId:'red',quantity:3}],original),false);
  assert.equal(dbk68ReplayCartMatches([{productId:'p1',variantId:'red',quantity:0}],original),false);
  assert.equal(dbk68ReplayCartMatches([{productId:'p1',variantId:'red',quantity:2},
    {productId:'p1',variantId:'blue',quantity:1}],original),true);
});
test('Cutover callback never silently falls back to Sanity',()=>{
  const callback=source('../app/api/payments/mobile/callback/route.ts');
  assert.match(callback,/dbk62CutoverRequested\(\)/);
  assert.match(callback,/Unmatched payment requires reconciliation/);
  assert.match(callback,/await handleDarajaStkCallback\(payload\)/);
});
test('Neon stock authority does not allow staff-attested Sanity stock writes',()=>{
  const core=source('../lib/db/dbk36-fulfillment.ts');
  assert.match(core,/STAFF_ATTESTED_NEON_FULFILLMENT_NOT_APPROVED/);
});
test('Provider-verified WhatsApp stock rejects receipts used in other ledgers',()=>{
  const sql=source('../migration/dbk103-wa-neon-stock.sql');
  assert.match(sql,/DBK103_PROVIDER_RECEIPT_ALREADY_USED/);
  assert.match(sql,/public\.dbk56_pos_payments/);
});
