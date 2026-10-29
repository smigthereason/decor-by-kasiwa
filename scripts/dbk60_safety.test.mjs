import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root),'utf8');
const sql = read('migration/dbk60/staged-manual-pos.sql');
const wrapper=read('lib/db/dbk60-pos-staging.ts');
const route=read('app/api/backoffice/pos/neon-stage/route.ts');
test('DBK-60 only uses pinned TEST branch and refuses production or default URL',()=>{
 assert.match(wrapper,/PINNED_TEST_HOST/); assert.match(wrapper,/KNOWN_PRODUCTION_HOST/);
 assert.match(wrapper,/url\.hostname === liveHost/);
 assert.match(wrapper,/neon\(process\.env\.DBK59_TEST_DATABASE_URL\)/);
 assert.doesNotMatch(wrapper,/getNeonSql\(/);
});
test('persistent test-stage route requires localhost, development, flags and ADMIN',()=>{
 for(const s of ['NODE_ENV === "development"','DBK60_STAGING_TEST','DBK60_TEST_WRITE','DBK58_LOCAL_PREVIEW','localhost','getApiStaff(["ADMIN"])'])assert.ok(route.includes(s),s);
 assert.ok(route.includes('request.headers.get("origin")'));
});
test('route uses live server-calculated POS input and synthetic references, never payment API',()=>{
 assert.ok(route.includes('previewDBK58ManualPosSale(input, seller)'));
 assert.doesNotMatch(route,/createPosManualSale|createPosMpesaSale|initiateDarajaStkPush|fetch\("https:\/\/api\.paystack/);
});
test('all child operations are inside one PostgreSQL transaction and gates restored off',()=>{
 assert.match(sql,/dbk57_record_manual_sale\(p_request_key,p_payload\)/);
 assert.match(sql,/INSERT INTO public\.dbk60_staged_manual_sales/);
 for(const name of ['dbk51_stock_engine_config','dbk56_ledger_config','dbk57_manual_sale_config']){
  assert.match(sql,new RegExp(name+' SET .*false'));
 }
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
});
test('replay validates entire input and returns without rededucting stock',()=>{
 assert.ok(sql.includes('v_original IS DISTINCT FROM p_payload'));
 assert.ok(sql.includes('v_existing.display_snapshot <> p_display'));
 assert.ok(sql.indexOf('IF FOUND THEN') < sql.indexOf('SET writes_enabled=true'));
});
test('read paths only query isolated staged records and preserve minor-unit financial fields',()=>{
 assert.match(wrapper,/JOIN public\.dbk60_staged_manual_sales/);
 for(const field of ['total_minor','collected_minor','balance_due_minor','overpaid_minor','financial_status'])assert.ok(wrapper.includes(field));
 assert.match(route,/ISOLATED_TEST_PERSISTED/);
});
test('synthetic test records are not represented as real receipts or live payment',()=>{
 assert.match(route,/simulatedPayment: true/);
 assert.match(route,/productionWrites: false/);
 assert.ok(route.includes('TEST ITEM'));
 assert.doesNotMatch(route,/app\/api\/backoffice\/pos\/sale\/route\.ts/);
});
