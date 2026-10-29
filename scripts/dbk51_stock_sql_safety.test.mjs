import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../migration/dbk51/neon-stock-engine.sql',import.meta.url),'utf8');
const wrapper = readFileSync(new URL('../lib/db/inventory-neon.ts',import.meta.url),'utf8');
test('engine starts with writes disabled and requires a completed seed',()=>{
  assert.match(sql,/writes_enabled boolean NOT NULL DEFAULT false/);
  assert.match(sql,/WHERE singleton AND writes_enabled AND seed_fingerprint IS NOT NULL/);
});
test('per-product transactional advisory lock protects concurrent deductions',()=>{
  assert.match(sql,/pg_advisory_xact_lock\(hashtextextended\('dbk51:'\|\|v_product,51\)\)/);
  assert.match(sql,/location_id=v_source AND on_hand>=v_quantity/);
  assert.match(sql,/incoming>=v_quantity/);
});
test('same idempotency key with changed payload is forbidden',()=>{
  assert.match(sql,/request_payload <> p_payload/);
  assert.match(sql,/Idempotency key reused with different payload/);
});
test('cannot silently reseed after any stock operation',()=>{
  assert.match(sql,/Stock engine already initialized; refusing overwrite/);
});
test('application wrapper rejects operations until separate cutover flag is enabled',()=>{
  assert.match(wrapper,/DBK_INVENTORY_BACKEND !== 'neon'/);
});
