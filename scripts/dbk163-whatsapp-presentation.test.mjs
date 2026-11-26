import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {packingLines} from '../lib/whatsapp/dbk162-packing.ts';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('paid orders and fulfilment use one read-only packing projection',()=>{
  const paid=read('lib/db/dbk36-paid-intake.ts'),ful=read('lib/db/dbk36-fulfillment.ts');
  assert.match(paid,/items:packingLines\(cart_snapshot,catalogue\)/);assert.match(paid,/items:packingLines\(cart_snapshot,await packingCatalogue/);assert.match(ful,/items:packingLines\(cart_snapshot,catalogue\)/);
  const x=packingLines([{productId:'a',quantity:1,subtotalMinor:3000}],[{id:'a',name:'Battery',imageUrl:'https://cdn.sanity.io/images/p/production/a.jpg'}]);assert.equal(x[0].subtotalMinor,3000);assert.equal(x[0].quantity,1);
});
test('read marker is viewer scoped, latest inbound only and has no delivery calls',()=>{
  const route=read('app/api/backoffice/whatsapp/inbox/route.ts');const marker=route.slice(route.indexOf("if(body.action==='read')"),route.indexOf("if(body.action==='assign')"));assert.match(marker,/staff_owner_id=\$\{id\}/);assert.match(marker,/direction='in'/);assert.match(marker,/ON CONFLICT\(wa_id,staff_id\)/);assert.doesNotMatch(marker,/deliverRecordedWhatsApp|fetch\(/);assert.match(route,/seen.staff_id=\$\{id\}/);
});
test('published preview reads persisted version and does not publish',()=>{
  const route=read('app/api/backoffice/whatsapp/knowledge/route.ts');const preview=route.slice(route.indexOf("'publishedQuestion' in content"),route.indexOf("'previewQuestion' in content"));assert.match(preview,/knowledgeHistory\(\)/);assert.match(preview,/answerKnowledge\(content.publishedQuestion,latest.content\)/);assert.doesNotMatch(preview,/publishKnowledge\(/);
});
test('staff navigation requests existing permission check, retains backend enforcement',()=>{
  const route=read('app/api/backoffice/whatsapp/inbox/route.ts');assert.match(route,/permissions\?\.includes\('WHATSAPP_SALES'\)/);assert.match(route,/staff=await authorized\(\)/);assert.match(read('components/backoffice/BackOfficeShell.tsx'),/inbox\?access=1/);
});
