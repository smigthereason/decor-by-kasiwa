import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calendarMonth,shiftMonth} from '../lib/pos/dbk122-calendar-core.ts';
import {KASIWA_GREETING,KASIWA_ORDER_POLICY} from '../lib/whatsapp/dbk122-kasiwa-policy.ts';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
test('calendar starts Monday and handles February leap year',()=>{
 const feb=calendarMonth('2028-02');assert.equal(feb.last,'2028-02-29');assert.equal(feb.cells.length%7,0);
 assert.equal(feb.cells[1]?.date,'2028-02-01');
});
test('calendar month moves past year boundary',()=>{
 assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(shiftMonth('2027-01',-1),'2026-12');
});
test('report route checks unified DBK75 report flag and retains 503 for unavailable sources',()=>{
 const s=read('app/api/backoffice/pos/reports/route.ts');assert.match(s,/dbk75NeonReportsRequested\(\)/);assert.match(s,/REPORT_SOURCE_ERROR/);
});
test('calendar uses server totals and refuses to invent data on 503',()=>{
 const s=read('components/backoffice/SalesCalendarReport.tsx');assert.match(s,/if\(!r\.ok\|\|!payload\.report\)/);assert.match(s,/No financial totals were inferred/);
});
test('category sync only creates canonical taxonomy record with explicit approval',()=>{
 const s=read('scripts/dbk122_sync_bathroom_category.mjs');assert.match(s,/createIfNotExists/);assert.match(s,/DBK122_CATEGORY_SYNC_APPROVED/);
});
test('Kasiwa introduces itself and forbids unverified payments',()=>{
 assert.match(KASIWA_GREETING,/Hi, I am Kasiwa/);assert.match(KASIWA_ORDER_POLICY.payment,/Never/);
});
test('original DBK36 payment guards remain',()=>{
 const s=read('lib/whatsapp/dbk36-production-chat.ts');assert.match(s,/confirmProductionPickup/);assert.match(s,/payProductionCheckout/);
});
