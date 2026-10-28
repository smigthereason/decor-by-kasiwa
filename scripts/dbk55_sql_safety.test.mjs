import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve,dirname } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sql=readFileSync(resolve(root,'migration/dbk55/paid-pos-settlement.sql'),'utf8');
const wrapper=readFileSync(resolve(root,'lib/db/pos-settlement-neon.ts'),'utf8');
const pos=readFileSync(resolve(root,'lib/pos/server.ts'),'utf8');
test('independent DBK-55 settlement gate defaults OFF',()=>{
 assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
 assert.match(sql,/DBK-55 paid settlement gate is disabled/g);
});
test('confirmed payment persists before nested stock attempt and survives stock exception',()=>{
 const f=sql.indexOf('FUNCTION public.dbk55_record_paid_pos');
 const insert=sql.indexOf('INSERT INTO public.dbk55_paid_pos_settlements',f);
 const attempt=sql.indexOf('dbk54_apply_stock_batch',insert);
 const exception=sql.indexOf('EXCEPTION WHEN OTHERS',attempt);
 assert.ok(f>=0&&insert>f&&attempt>insert&&exception>attempt);
 assert.match(sql,/stock_status='REVIEW_REQUIRED'/);
 assert.match(sql,/financial_status text NOT NULL DEFAULT 'PAID' CHECK \(financial_status='PAID'\)/);
});
test('replayed payment never automatically retries stock',()=>{
 const f=sql.indexOf('FUNCTION public.dbk55_record_paid_pos');
 const replay=sql.indexOf('RETURN jsonb_build_object',f);
 const stock=sql.indexOf('dbk54_apply_stock_batch',f);
 assert.ok(replay>f && replay<stock);
});
test('provider proof and receipt are constrained unique; a replay must match full payload',()=>{
 assert.match(sql,/UNIQUE \(payment_provider,provider_payment_id\)/);
 assert.match(sql,/dbk55_unique_receipt_idx/);
 assert.match(sql,/v_existing\.source_payload<>p_payload/);
 assert.match(sql,/source_payload jsonb NOT NULL/);
});
test('SQL prevents unallocated sales and requires a known order for retry',()=>{
 assert.match(sql,/__UNALLOCATED_VARIANT__/);
 assert.match(sql,/__UNALLOCATED__/);
 assert.match(sql,/Unknown paid order cannot change inventory/);
});
test('functions are not exposed as public and app requires four explicit gates',()=>{
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.dbk55_record_paid_pos\(text,jsonb\) FROM PUBLIC/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.dbk55_retry_paid_pos_stock\(text\) FROM PUBLIC/);
 for(const flag of ['DBK_POS_LEDGER_BACKEND','DBK_POS_SETTLEMENT_CUTOVER','DBK_INVENTORY_BACKEND','DBK_INVENTORY_BASKET_CUTOVER']) assert.ok(wrapper.includes(flag));
 assert.doesNotMatch(pos,/dbk55_record_paid_pos|recordPaidPosSettlement/);
});
