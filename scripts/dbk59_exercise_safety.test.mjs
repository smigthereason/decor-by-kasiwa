import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const get=(p)=>readFileSync(p,'utf8');
const route=get('app/api/backoffice/pos/neon-exercise/route.ts');
const lib=get('lib/db/dbk59-pos-exercise.ts');
const sql=get('migration/dbk59/rollback-manual-sale.sql');
const sale=get('app/api/backoffice/pos/sale/route.ts');

test('Only localhost development and explicit flags can access exercise',()=>{
 for(const exp of [/NODE_ENV !== "development"/,/DBK58_LOCAL_PREVIEW !== "YES"/,/DBK59_LOCAL_EXERCISE !== "YES"/,/localhost/,/127\.0\.0\.1/,/origin.*url\.origin/,/application\/json/])assert.match(route,exp);
 assert.doesNotMatch(route,/export async function GET/);
});
test('Only authenticated admin and active valid Sanity store may test',()=>{
 assert.match(route,/getApiStaff\(\["ADMIN"\]\)/);
 assert.match(route,/_type == "storeLocation" && _id == \$id && active != false/);
 assert.match(route,/cache: "no-store"/);
});
test('Server uses exact live validation and never trusts client prices',()=>{
 assert.match(route,/previewDBK58ManualPosSale\(input, seller\)/);
 assert.doesNotMatch(route,/input\.unitPrice|input\.amountPaid/);
});
test('Database connection is separate and pinned; cannot resolve production via DATABASE_URL',()=>{
 assert.match(lib,/DBK59_TEST_DATABASE_URL/);
 assert.match(lib,/testUrl\.hostname !== PINNED_TEST_HOST/);
 assert.match(lib,/testUrl\.hostname === prodHost/);
 assert.match(lib,/testUrl\.hostname === KNOWN_PRODUCTION_HOST/);
 assert.doesNotMatch(lib,/getNeonSql\(\)/);
});
test('SQL calls the real atomic sale within an intentional rollback-only subtransaction',()=>{
 assert.match(sql,/v_sale := public\.dbk57_record_manual_sale/);
 assert.match(sql,/RAISE EXCEPTION USING ERRCODE='ZX591'/);
 assert.match(sql,/EXCEPTION WHEN SQLSTATE 'ZX591' THEN/);
 assert.match(sql,/stockCommittedInTrial/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.dbk59_rollback_manual_sale\(text,jsonb\) FROM PUBLIC/);
});
test('SQL requires gates off and resets them in the same SQL statement',()=>{
 assert.match(sql,/v_stock_gate IS DISTINCT FROM false/);
 assert.match(sql,/v_ledger_gate IS DISTINCT FROM false/);
 assert.match(sql,/v_manual_gate IS DISTINCT FROM false/);
 for(const tbl of ['dbk51_stock_engine_config','dbk56_ledger_config','dbk57_manual_sale_config']){
   assert.ok(sql.match(new RegExp(`UPDATE public\\.${tbl} SET`, 'g')).length===2,tbl);
 }
});
test('No live POS/webhook/checkout integration or provider proof is claimed',()=>{
 assert.match(sale,/await createPosManualSale\(body, seller\)/);
 assert.doesNotMatch(sale,/DBK59|exerciseDBK59|dbk59_rollback_manual_sale/);
 assert.match(route,/simulatedPayment: true/);
 assert.match(route,/noWritesPersisted: true/);
});
