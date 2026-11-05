import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogueItem,categories,rankedProducts,categoryProducts,pageOf,categoryMessage,
  productsMessage,productDetail
} from '../lib/whatsapp/browse-core.ts';

const product=(id,category,extra={})=>({id,name:`Product ${id}`,slug:`product-${id}`,
  category,description:'Quality indoor decor',price:100+id,stockQuantity:10,
  ecommerceEnabled:true,available:true,...extra});
const data=[...Array.from({length:7},(_,i)=>product(i+1,'Plants')),
  ...Array.from({length:3},(_,i)=>product(i+20,'Vases'))].map(catalogueItem);
const items=data.filter(Boolean);

test('does not cache sold-out, disabled, unpriced or slugless items',()=>{
  for (const changes of [ {stockQuantity:0},{available:false},{ecommerceEnabled:false},
    {price:0},{slug:'../foo'},{stockQuantity:-1}])
    assert.equal(catalogueItem(product(1,'Plants',changes)),null);
  assert.ok(catalogueItem(product(1,'Plants')));
});
test('sanitizes names and description before customer output',()=>{
  assert.equal(catalogueItem(product(2,'Home', {name:'Nice\n*Mirror*'})).name,'Nice Mirror');
});
test('dynamic categories are sorted, stable and de-duplicated',()=>{
  assert.deepEqual(categories(items),['Plants','Vases']);
});
test('product pages are 7 items, with stable NEXT/BACK bounds',()=>{
  const plants=categoryProducts(items,'Plants');
  assert.equal(pageOf(plants,0).items.length,7);
  assert.equal(pageOf(plants,1).items.length,7); // out of range clamps to page 1 of 1
  assert.equal(pageOf(plants,99).page,0);
  assert.equal(pageOf(plants,-1).page,0);
});
test('category pages offer navigation without claiming a purchase',()=>{
  const text=categoryMessage(['A','B','C','D','E','F','G','H'],0,'https://example.test');
  assert.match(text,/1\/2/); assert.match(text,/NEXT/); assert.match(text,/MENU/);
  assert.doesNotMatch(text,/order placed|payment confirmed/i);
});
test('search ranks names, then categories, and never invents results',()=>{
  assert.equal(rankedProducts(items,'product 22')[0].id,'22');
  assert.equal(rankedProducts(items,'glass saucepan').length,0);
  assert.ok(rankedProducts(items,'plants').length>0);
});
test('product messages include real values, local links and result count',()=>{
  const out=productsMessage(items,1,'https://www.decorbykasiwa.co.ke','Products');
  assert.match(out,/KES 120/); assert.match(out,/shop\/product-20/);
  assert.match(out,/\(2\/2, 10 items\)/);
  assert.doesNotMatch(out,/purchase completed|reserved/i);
});
test('product detail is safe, describes price and sends customer to website',()=>{
  const text=productDetail(items[0],'https://www.decorbykasiwa.co.ke');
  assert.match(text,/Product 1/); assert.match(text,/KES 101/);
  assert.match(text,/shop\/product-1/); assert.match(text,/confirmed at checkout/);
});
test('source-code contract: browsing never triggers per-message Sanity catalogue fetch',async()=>{
  const fs=await import('node:fs');
  const flow=fs.readFileSync('lib/whatsapp/browse-flow.ts','utf8');
  const cache=fs.readFileSync('lib/whatsapp/catalogue-cache.ts','utf8');
  assert.doesNotMatch(flow,/getStoreProducts|sanity\/lib\/catalog|\.create\(|\.patch\(/);
  assert.match(cache,/refreshWhatsAppCatalogue/);
});
