import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mainMenu, parseAction, searchPrompt } from '../lib/whatsapp/interactive-core.ts';
import { catalogueItem, rankedProducts, pageOf } from '../lib/whatsapp/browse-core.ts';
import { parseIncomingMessages } from '../lib/whatsapp/core.ts';

const rows = () => {
  const menu = mainMenu();
  assert.equal(menu.type, 'list');
  return menu.action.sections.flatMap(section => section.rows);
};

test('search by product name is a visible main menu choice', () => {
  assert.deepEqual(rows().map(row => row.id),
    ['dbk36:shop', 'dbk36:search', 'dbk36:services', 'dbk36:staff']);
  assert.equal(rows()[1].title, 'Search by product name');
  assert.match(mainMenu().body.text, /search by product name/i);
});

test('Meta interactive limits are respected', () => {
  const m = mainMenu();
  assert.ok(m.body.text.length <= 1024);
  assert.ok(m.action.button.length <= 20);
  assert.ok(rows().length <= 10);
  for (const row of rows()) {
    assert.ok(row.title.length <= 24);
    assert.ok((row.description || '').length <= 72);
    assert.ok(row.id.length <= 200);
  }
  assert.equal(new Set(rows().map(r => r.id)).size, rows().length);
});

test('Meta list selection maps back to search action', () => {
  const input = { object: 'whatsapp_business_account', entry: [{ changes: [{field:'messages', value:{
    metadata:{phone_number_id:'123'}, messages:[{
      id:'wamid.dbk36.search',from:'254700000000',type:'interactive',
      interactive:{type:'list_reply',list_reply:{id:'dbk36:search',title:'Search by product name'}}
    }]
  }}]}]};
  const messages = parseIncomingMessages(input, '123');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type,'text');
  assert.equal(messages[0].text,'dbk36:search');
  assert.equal(parseAction(messages[0].text),'search');
});

test('search prompts for product name and retains safe navigation controls',()=>{
  const prompt = searchPrompt();
  assert.equal(prompt.type,'button');
  assert.match(prompt.body.text,/Type the product name/i);
  assert.deepEqual(prompt.action.buttons.map(x=>x.reply.id),['dbk36:shop','dbk36:menu']);
});

test('name search uses existing ranked Neon catalogue results, with no false hits',()=>{
  const products = [
    {id:'p1',name:'Gold Wall Mirror',slug:'gold-mirror',price:2500,category:'Mirrors',stockQuantity:2},
    {id:'p2',name:'Ceramic Vase',slug:'ceramic-vase',price:1200,category:'Vases',stockQuantity:3},
    {id:'p3',name:'Out of Stock Mirror',slug:'out-of-stock',price:500,category:'Mirrors',stockQuantity:0},
  ].map(catalogueItem).filter(Boolean);
  assert.deepEqual(rankedProducts(products,'gold mirror').map(p=>p.id),['p1']);
  assert.deepEqual(rankedProducts(products,'ceramic vase').map(p=>p.id),['p2']);
  assert.equal(rankedProducts(products,'xyznonexistent987').length,0);
  assert.equal(pageOf(rankedProducts(products,'mirror'),0).items[0].id,'p1');
});

test('search action clears prior browse state and does not call Sanity',()=>{
  const src = readFileSync(new URL('../lib/whatsapp/browse-flow.ts',import.meta.url),'utf8');
  assert.match(src,/if \(action === 'search'[\s\S]*?await clearBrowseState\(waId\)[\s\S]*?searchPrompt\(\)/);
  assert.match(src,/rankedProducts\(products, query\)/);
  assert.match(src,/readWhatsAppCatalogue\(\)/);
  assert.doesNotMatch(src,/getStoreProducts|fetch\([^\n]*sanity/);
});

test('persisted menu copy follows customer-visible interactive text',()=>{
  const src = readFileSync(new URL('../lib/whatsapp/browse-flow.ts',import.meta.url),'utf8');
  assert.match(src,/const interactive = mainMenu\(\);\s*return done\(interactive\.body\.text, interactive\)/);
});
