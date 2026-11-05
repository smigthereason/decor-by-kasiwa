import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mainMenu, servicesMenu, categoryList, productList, detailButtons,
  selectionId, selectionMatches, parseSelection, parseAction, isSafePublicImageUrl,
} from '../lib/whatsapp/interactive-core.ts';
import { catalogueItem } from '../lib/whatsapp/browse-core.ts';
import { parseIncomingMessages } from '../lib/whatsapp/core.ts';

const p = (i, extra={}) => catalogueItem({
  id:`item${i}`, name:`Product ${i}`, slug:`product-${i}`, category:'Decor',
  description:'Premium home decor', price:2500+i, stockQuantity:12, ...extra,
});
const products = Array.from({length:17}, (_,i)=>p(i+1));
const categories = Array.from({length:35}, (_,i)=>`Category ${String(i+1).padStart(2,'0')}`);
const whatsapp = (msg) => ({ object:'whatsapp_business_account',entry:[{ changes:[{field:'messages',value:{
  metadata:{phone_number_id:'123'}, messages:[{id:'wamid.test',from:'254700000000',type:'interactive',interactive:msg}],
}}]}] });

function validateInteractive(value) {
  assert.ok(value.type === 'button' || value.type === 'list');
  assert.ok(value.body.text.length > 0);
  if (value.type === 'button') {
    assert.ok(value.body.text.length <= 1024);
    assert.ok(value.action.buttons.length >= 1 && value.action.buttons.length <= 3);
    for (const b of value.action.buttons) {
      assert.ok(b.reply.title.length <= 20 && b.reply.id.length <= 200);
    }
  } else {
    assert.ok(value.action.button.length <= 20);
    const rows = value.action.sections.flatMap(s => s.rows);
    assert.ok(rows.length >= 1 && rows.length <= 10);
    for (const r of rows) {
      assert.ok(r.title.length <= 24 && r.title.length > 0);
      assert.ok(!r.description || r.description.length <= 72);
      assert.ok(r.id.length <= 200);
    }
    assert.equal(new Set(rows.map(r=>r.id)).size, rows.length);
  }
}

test('main menu shows all four actions in a WhatsApp list', () => {
  const m=mainMenu();validateInteractive(m);
  assert.equal(m.type,'list');
  assert.deepEqual(m.action.sections.flatMap(s=>s.rows).map(x=>x.id),[
    'dbk36:shop','dbk36:search','dbk36:services','dbk36:staff',
  ]);
  assert.match(m.action.sections[0].rows[1].title,/Search by product name/);
  assert.equal(parseAction('dbk36:search'),'search');
  assert.equal(parseAction('dbk36:staff'),'staff');
  assert.equal(parseAction('dbk36:unknown'),null);
});

test('services menu stays within Meta list limits',()=>{
  const menu=servicesMenu();validateInteractive(menu);
  assert.equal(menu.type,'list');
  assert.equal(menu.action.sections[0].rows.length,5);
});

test('35 categories use five interactive pages, up to 10 rows including navigation',()=>{
  for(let page=0;page<5;page++) {
    const m=categoryList(categories,page);validateInteractive(m);
    assert.match(m.header.text, new RegExp(`${page+1}/5`));
    assert.equal(m.action.sections[0].rows.filter(r=>r.id.startsWith('dbk36:c:')).length,7);
  }
  const middle=categoryList(categories,2).action.sections[0].rows;
  assert.equal(middle.length,10);
  assert.ok(middle.some(r=>r.id==='dbk36:prev'));
  assert.ok(middle.some(r=>r.id==='dbk36:next'));
});

test('product list uses verified product values, not invented availability claims',()=>{
  const m=productList(products,1,'Decor');validateInteractive(m);
  assert.equal(m.type,'list');
  assert.equal(m.action.sections[0].rows.length,10);
  assert.match(m.action.sections[0].rows[0].description,/KES 2,508/);
  assert.match(m.body.text,/Page 2\/3/);
});

test('a selection is tied to the page, index and item ID',()=>{
  const id=selectionId('c',3,4,'Candles');
  assert.deepEqual(parseSelection(id),{kind:'c',page:3,index:4,fingerprint:id.split(':')[4]});
  assert.equal(selectionMatches(id,'c',3,4,'Candles'),true);
  assert.equal(selectionMatches(id,'c',3,4,'Baskets'),false);
  assert.equal(selectionMatches(id,'c',2,4,'Candles'),false);
  assert.equal(parseSelection('dbk36:c:../../pay'),null);
});

test('interactive selection webhook is captured as text for the existing Neon queue',()=>{
  const id=selectionId('c',0,2,'Baskets');
  const list = parseIncomingMessages(whatsapp({type:'list_reply',list_reply:{id,title:'Baskets'}}),'123');
  assert.equal(list.length,1);
  assert.equal(list[0].type,'text');
  assert.equal(list[0].text,id);
  const buttons = parseIncomingMessages(whatsapp({type:'button_reply',button_reply:{id:'dbk36:shop',title:'Shop products'}}),'123');
  assert.equal(buttons[0].text,'dbk36:shop');
  const other = parseIncomingMessages(whatsapp({type:'button_reply',button_reply:{id:'other-app:pay',title:'Pay'}}),'123');
  assert.equal(other[0].type,'unsupported');
});

test('product card can carry public Sanity photo without exposing private URLs',()=>{
  const item=p(1,{imageUrl:'https://cdn.sanity.io/images/project/dataset/img.jpg?w=640'});
  assert.ok(item.imageUrl);
  const d=detailButtons(item,'https://www.decorbykasiwa.co.ke');
  validateInteractive(d);
  assert.equal(d.header?.type,'image');
  assert.match(d.body.text,/product-1/);
  for(const v of ['https://internal.example.com/image.jpg','http://cdn.sanity.io/foo.jpg',
    'https://cdn.sanity.io/foo.webp','https://cdn.sanity.io/a.jpg?token=secret']) {
    assert.equal(isSafePublicImageUrl(v),false);
  }
  assert.equal(p(1,{imageUrl:'https://evil.example.com/file.jpg'}).imageUrl,undefined);
});
