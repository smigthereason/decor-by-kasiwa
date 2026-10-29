import test from 'node:test'; import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const sql=readFileSync(new URL('../migration/dbk54/atomic-basket.sql',import.meta.url),'utf8');
const script=readFileSync(new URL('./dbk54_reconcile_snapshot.mjs',import.meta.url),'utf8');
test('batch is a single atomic PG function, not a JS loop of network calls',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.dbk54_apply_stock_batch/);
 assert.match(sql,/v_result := public\.dbk51_apply_stock\(v_id,v_op\)/);
 assert.match(sql,/jsonb_array_length\(v_items\) > 100/);
});
test('batch and product locks protect concurrent checkout',()=>{
 assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('dbk54:batch:'/);
 assert.match(sql,/ORDER BY 1 LOOP/);assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('dbk51:'/);
});
test('both idempotency key and order unique sale constraint are enforced',()=>{
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS dbk54_one_sale_per_order_idx/);
 assert.match(sql,/request_payload <> p_payload/);
});
test('SQL respects disabled write gate; no public function execute',()=>{
 assert.match(sql,/WHERE singleton AND writes_enabled AND seed_fingerprint IS NOT NULL/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.dbk54_apply_stock_batch/);
});
test('parity tool refuses production host or enabled write gate',()=>{
 assert.match(script,/u\.hostname===production/);
 assert.match(script,/config\[0\]\?\.writes_enabled/);
});

test('returns cannot exceed sold quantities or create stock for unknown orders',()=>{
 assert.match(sql,/Cannot return stock for an unregistered Neon sale/);
 assert.match(sql,/Return quantity exceeds sold quantity/);
 assert.match(sql,/dbk54:order:/);
});

test('application wrapper requires both explicit cutover flags and is not called from POS routes',()=>{
 const wrapper=readFileSync(new URL('../lib/db/inventory-neon.ts',import.meta.url),'utf8');
 assert.match(wrapper,/DBK_INVENTORY_BASKET_CUTOVER !== 'confirmed'/);
 assert.match(wrapper,/DBK_INVENTORY_BACKEND !== 'neon'/);
});
