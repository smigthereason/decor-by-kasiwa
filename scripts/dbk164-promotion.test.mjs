import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {bulkPromotionActive,bulkPromotionUnitPrice,getActiveSaleUnitPrice,getQuantityUnitPrice,getPriceComparison,whatsappPromotionPrice,whatsappPromotionCatalogue} from '../lib/product-pricing.ts';
import {compareAuthoritativeQuote} from '../lib/whatsapp/dbk36-stock-check-core.ts';
const active={startsAt:'2000-01-01T00:00:00+03:00',endsAt:'2099-01-01T00:00:00+03:00'};
const inactive={startsAt:'2098-01-01T00:00:00+03:00',endsAt:'2099-01-01T00:00:00+03:00'};
const raw={price:4500,retailPrice:4500,bulkPromotion:active};
test('10% promotion active on inclusive start, exclusive end; invalid dates disabled',()=>{
 const start=Date.parse(active.startsAt),end=Date.parse(active.endsAt);
 assert.equal(bulkPromotionActive(active,start-1),false);assert.equal(bulkPromotionActive(active,start),true);assert.equal(bulkPromotionActive(active,end),false);
 assert.equal(bulkPromotionActive({startsAt:'bad',endsAt:active.endsAt}),false);
});
test('standard product: same retail promotion in storefront/POS/WA; normal price preserved',()=>{
 assert.equal(getQuantityUnitPrice(raw,1),4050);assert.equal(whatsappPromotionPrice(raw),4050);
 assert.equal(getPriceComparison(raw).referencePrice,4500);assert.equal(getPriceComparison(raw).savingsPercent,10);assert.equal(raw.price,4500);
});
test('variant uses its own regular price; no leaking fixed parent price or double discount',()=>{
 const mapped={...raw,price:4050,onSale:true,individualSaleEnabled:true,salePrice:1000,variants:[{id:'white',price:4500},{id:'gold',price:5000},{id:'inherited'}]};
 assert.equal(getQuantityUnitPrice(mapped,1,4500),4050);assert.equal(getQuantityUnitPrice(mapped,1,5000),4500);
 const result=whatsappPromotionCatalogue([mapped])[0];assert.deepEqual(result.variants.map(v=>v.price),[4050,4500,1000]);
 assert.equal(mapped.variants[0].price,4500);
});
test('whole shilling policy is positive and transparent for low-value products',()=>{
 assert.deepEqual([2,3,8,10,30,50,100,4500].map(bulkPromotionUnitPrice),[2,3,7,9,27,45,90,4050]);
});
test('existing deeper parent sale and wholesale tier remain non-stacking; no accidental individual sale activation',()=>{
 assert.equal(getActiveSaleUnitPrice({...raw,onSale:true,salePrice:3500}),3500);
 assert.equal(getQuantityUnitPrice({...raw,wholesalePrice:3000,wholesaleMinQuantity:5},5),3000);
 assert.equal(getActiveSaleUnitPrice({...raw,onSale:true,individualSaleEnabled:false,salePrice:1000}),4050);
});
test('off and future campaigns preserve original price behavior and variant identity',()=>{
 const p={price:4500,retailPrice:4500,bulkPromotion:inactive,variants:[{id:'a',price:5000}]};
 assert.equal(getQuantityUnitPrice(p,1,5000),5000);assert.equal(whatsappPromotionCatalogue([p])[0],p);
 assert.equal(getQuantityUnitPrice({price:100,onSale:true,salePrice:80},1),80);
});
test('live quote accepts discounted variant total and rejects stale prices/stock',()=>{
 const p={...raw,id:'mirror',stockQuantity:3,variants:[{id:'gold',price:5000,stockQuantity:3}]};
 const discounted=whatsappPromotionCatalogue([p]);
 const quote={reference:'DBKWA1234567',amountKes:9000,lines:[{productId:'mirror',variantId:'gold',quantity:2,subtotal:9000}]};
 assert.equal(compareAuthoritativeQuote(quote,discounted,[p]),true);
 assert.equal(compareAuthoritativeQuote({...quote,amountKes:10000,lines:[{...quote.lines[0],subtotal:10000}]},discounted,[p]),false);
 assert.equal(compareAuthoritativeQuote(quote,discounted,[{...p,variants:[{...p.variants[0],stockQuantity:1}]}]),false);
});
test('server requires explicit rounding and valid window, cache epoch changes on start/end',()=>{
 const source=readFileSync(new URL('../lib/dbk164-promotion-server.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 const m={exports:{}};const env={};
 new Function('require','module','exports','process',compiled)(k=>k==='server-only'?{}:{bulkPromotionActive},m,m.exports,{env});
 const {configuredBulkPromotion,promotionCacheKey}=m.exports;
 assert.equal(configuredBulkPromotion(),undefined);Object.assign(env,{DBK164_PROMOTION_ENABLED:'YES',DBK164_PROMOTION_START:active.startsAt,DBK164_PROMOTION_END:active.endsAt});
 assert.equal(configuredBulkPromotion(),undefined);env.DBK164_PROMOTION_ROUNDING='WHOLE_KES';assert.deepEqual(configuredBulkPromotion(),active);
 assert.equal(promotionCacheKey(Date.parse(active.startsAt)-1),'off');assert.match(promotionCacheKey(Date.parse(active.startsAt)),/^dbk164:/);assert.equal(promotionCacheKey(Date.parse(active.endsAt)),'off');
 env.DBK164_PROMOTION_END='invalid';assert.equal(configuredBulkPromotion(),undefined);
});
test('actual WhatsApp catalogue adapter prices live product variants, leaves cached prices unchanged',()=>{
 const source=readFileSync(new URL('../lib/whatsapp/dbk36-production-chat.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const m={exports:{}};
 const mocks={'../product-pricing':{whatsappPromotionPrice},'./dbk155-sales-core':{productImage:()=>undefined},'../dbk164-promotion-server':{promotionCacheKey:()=> 'off'}};
 new Function('require','module','exports',compiled)(k=>mocks[k]||{},m,m.exports);
 const sourceProduct={...raw,id:'mirror',name:'Mirror',slug:'mirror',stockQuantity:4,variants:[{id:'gold',title:'Gold',price:5000,stockQuantity:2},{id:'white',title:'White',stockQuantity:2}]};
 const item=m.exports.catalogueItem(sourceProduct);
 assert.equal(item.price,4050);assert.deepEqual(item.variantOptions.map(v=>v.price),[4500,4050]);
 assert.deepEqual(m.exports.catalogueItem(item),item);
});
