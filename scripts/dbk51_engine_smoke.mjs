#!/usr/bin/env node
// Isolated test-branch ONLY. Seeds disposable fixture stock and exercises concurrency.
// Run on a new, empty dbk51-test branch after applying the DBK-51 SQL schema.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
const endpoint = process.env.DATABASE_URL && new URL(process.env.DATABASE_URL);
const expected = process.env.DBK51_EXPECTED_TEST_HOST;
const production = process.env.DBK51_PRODUCTION_HOST;
if (!endpoint || !expected || !production || expected === production || endpoint.hostname !== expected || endpoint.hostname === production ||
    process.env.DBK51_TEST_WRITE !== 'YES') {
  throw new Error('REFUSING to run: TEST BRANCH ONLY, host mismatch, or test-write flag missing');
}
const sql = neon(process.env.DATABASE_URL);
const suffix = randomUUID().replaceAll('-','');
const productId = `dbk51-fixture-${suffix}`;
const storeA = `dbk51-storeA-${suffix}`;
const storeB = `dbk51-storeB-${suffix}`;
const rows = [
  {product_id:productId,variant_id:'',location_id:storeA,on_hand:10,incoming:4,product_revision:'fixture-p1',inventory_revision:'fixture-i1'},
  {product_id:productId,variant_id:'',location_id:'__UNALLOCATED__',on_hand:0,incoming:0,product_revision:'fixture-p1',inventory_revision:'fixture-i1'},
];
let enabled = false;
let fixtureInserted = false;
try {
  const config = await sql`SELECT writes_enabled, seed_fingerprint FROM public.dbk51_stock_engine_config WHERE singleton`;
  if (config[0]?.writes_enabled || !config[0]?.seed_fingerprint) throw new Error('Seed the real export in the TEST BRANCH first; its write gate must be off');
  await sql`INSERT INTO public.dbk51_stock_balances
    (product_id,variant_id,location_id,on_hand,incoming,product_revision,inventory_revision,seed_fingerprint)
    VALUES
    (${productId},'',${storeA},10,4,'fixture-p1','fixture-i1',${config[0].seed_fingerprint}),
    (${productId},'','__UNALLOCATED__',0,0,'fixture-p1','fixture-i1',${config[0].seed_fingerprint})`;
  fixtureInserted = true;
  const op = (kind, quantity, name, extra={}) => sql`
    SELECT public.dbk51_apply_stock(${`dbk51-smoke-${suffix}-${name}`},
      ${JSON.stringify({type:kind,productId,variantId:'',quantity,...extra})}::jsonb) AS result
  `;
  await assert.rejects(op('PURCHASE',1,'gate',{destinationStoreId:storeA}), /write gate is disabled/);
  await sql`UPDATE public.dbk51_stock_engine_config SET writes_enabled=true,updated_at=now() WHERE singleton`;
  enabled = true;
  await op('PURCHASE',3,'purchase',{destinationStoreId:storeA});
  await op('RECEIVE',3,'receive',{destinationStoreId:storeA});
  await op('TRANSFER',2,'transfer',{sourceStoreId:storeA,destinationStoreId:storeB});
  await op('SALE',2,'sale',{sourceStoreId:storeA,orderId:`fixture-${suffix}`});
  await op('RETURN',1,'refund',{destinationStoreId:storeA,orderId:`fixture-${suffix}`});
  const replay=await op('SALE',2,'sale',{sourceStoreId:storeA,orderId:`fixture-${suffix}`});
  assert.equal(replay[0].result.replayed,true);
  await assert.rejects(op('SALE',3,'sale',{sourceStoreId:storeA,orderId:`fixture-${suffix}`}), /Idempotency key reused/);
  await assert.rejects(op('SALE',1000,'too-many',{sourceStoreId:storeA,orderId:`fixture-${suffix}`}), /Insufficient stock/);
  // Ten available units at A: 10 + 3 receive - 2 transfer - 2 sale + 1 return = 10.
  const attempts = await Promise.allSettled(Array.from({length:12},(_,i)=>
    op('SALE',1,`concurrent-${i}`,{sourceStoreId:storeA,orderId:`fixture-${suffix}`})));
  const successes = attempts.filter(x=>x.status==='fulfilled').length;
  const failures = attempts.filter(x=>x.status==='rejected').length;
  assert.equal(successes,10);
  assert.equal(failures,2);
  const balances=await sql`SELECT location_id,on_hand,incoming FROM public.dbk51_stock_balances WHERE product_id=${productId} ORDER BY location_id`;
  assert.equal(Number(balances.find(r=>r.location_id===storeA).on_hand),0);
  assert.equal(Number(balances.find(r=>r.location_id===storeA).incoming),4);
  assert.equal(Number(balances.find(r=>r.location_id===storeB).on_hand),2);
  const ops=await sql`SELECT count(*)::int AS n FROM public.dbk51_stock_operations WHERE product_id=${productId}`;
  assert.equal(Number(ops[0].n),15); // purchase,receive,transfer,sale,return + 10 successful concurrent sales
  console.log(JSON.stringify({stage:'DBK-51',mode:'ISOLATED TEST PASS',successes,insufficientStockRejections:failures,operationCount:ops[0].n,balances},null,2));
} finally {
  if (enabled) {
    await sql`UPDATE public.dbk51_stock_engine_config SET writes_enabled=false,updated_at=now() WHERE singleton`;
    console.log('TEST write gate disabled.');
  }
  if (fixtureInserted) {
    await sql`DELETE FROM public.dbk51_stock_operations WHERE product_id=${productId}`;
    await sql`DELETE FROM public.dbk51_stock_balances WHERE product_id=${productId}`;
    console.log('Isolated fixture rows cleaned up.');
  }
}
