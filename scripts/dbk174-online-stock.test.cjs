const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function harness(rows,products=[],stores=[]){
 const calls=[];const modules=new Map();
 const real=new Set(['lib/db/dbk64-online-neon.ts','lib/db/dbk64-online-core.ts','lib/paystack/server.ts','lib/inventory/stock.ts','lib/product-pricing.ts']);
 const mocks={
  '@/lib/db/dbk62-pos-cutover':{dbk62GetProductionSql:()=>async(parts,...args)=>{calls.push({query:parts.join('?'),args});return rows;}},
  '@/sanity/lib/serverClient':{serverClient:{fetch:async(query)=>query.includes('"storeLocation"')?stores:products}},
  '@/lib/stores/main-store':{getMainStore:async()=>({id:'tumaini',name:'Tumaini'})},
  '@/lib/dbk164-promotion-server':{configuredBulkPromotion:()=>undefined},
  '@/lib/operations/workflow':{workflowForProducts:()=>{throw Error('STOCK_CHECK_PASSED');}},
 };
 function load(file){if(modules.has(file))return modules.get(file).exports;const m={exports:{}};modules.set(file,m);
 const req=id=>id==='server-only'?{}:id.startsWith('node:')?require(id):id in mocks?mocks[id]:id.startsWith('@/')?(real.has(id.slice(2)+'.ts')?load(id.slice(2)+'.ts'):{}):require(id);
 const out=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 new Function('require','module','exports','fetch',out.outputText)(req,m,m.exports,()=>{throw Error('Unexpected payment dispatch');});return m.exports;}
 return {calls,load};
}
async function withEnv(fn){const env={DBK_INVENTORY_BACKEND:'neon',DBK64_ONLINE_BACKEND:'neon',DBK64_CUTOVER_APPROVED:'YES'};const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);try{await fn();}finally{for(const k in old){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}}
const line=(variantId,quantity=1)=>({productId:'p1',variantId,quantity,name:'Plant'});
const row=(variant_id,on_hand)=>({product_id:'p1',variant_id,on_hand});
test('all requested SKUs are checked at the selected store, and missing balance blocks payment',()=>withEnv(async()=>{
 const h=harness([row('green',null)]);await assert.rejects(h.load('lib/db/dbk64-online-neon.ts').dbk64AssertCheckoutStock('tumaini',[line('green')]),/only 0 units/);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].args[1],'tumaini');assert.match(h.calls[0].query,/b\.variant_id=r\."variantId" AND b\.location_id=/);
}));
test('duplicate cart lines aggregate exact SKU quantities, and other variants cannot cover a shortage',()=>withEnv(async()=>{
 const h=harness([row('green',3),row('pink',100)]);await assert.rejects(h.load('lib/db/dbk64-online-neon.ts').dbk64AssertCheckoutStock('tumaini',[line('green',2),line('green',2),line('pink')]),/only 3 units/);
 assert.deepEqual(JSON.parse(h.calls[0].args[0]),[{productId:'p1',variantId:'green',quantity:4},{productId:'p1',variantId:'pink',quantity:1}]);
}));
test('standard products with blank variant use actual on-hand, not incoming or catalogue totals',()=>withEnv(async()=>{
 const h=harness([row('','4')]);await h.load('lib/db/dbk64-online-neon.ts').dbk64AssertCheckoutStock('tumaini',[line(undefined,4)]);assert.deepEqual(JSON.parse(h.calls[0].args[0]),[{productId:'p1',variantId:'',quantity:4}]);
}));
test('invalid, duplicate or missing result rows fail closed',()=>withEnv(async()=>{
 for(const rows of [[],[row('green',3),row('green',3)],[row('pink',3)],[row('green',-1)]]){
  const h=harness(rows);await assert.rejects(h.load('lib/db/dbk64-online-neon.ts').dbk64AssertCheckoutStock('tumaini',[line('green')]),/unavailable/);
 }
}));
function input(cart){return {email:'test@example.com',address:{fullName:'Test',phone:'0700000000',address1:'Test',city:'Nairobi',region:'Nairobi',country:'Kenya'},cart,paymentMethod:'mobile_money',callbackBaseUrl:'https://example.com'};}
test('actual checkout stops before workflow, pending order or Paystack on unmanaged product with missing store stock',()=>withEnv(async()=>{
 const h=harness([row('',null)],[{_id:'p1',name:'Plant',price:100,initialStock:100}]);await assert.rejects(h.load('lib/paystack/server.ts').initializePaystackCheckout(input([{productId:'p1',quantity:1}])),/only 0 units/);assert.equal(h.calls.length,1);
}));
test('actual Neon checkout uses live variant balance despite stale zero catalogue stock',()=>withEnv(async()=>{
 const h=harness([row('green',4)],[{_id:'p1',name:'Plant',price:100,variants:[{_key:'green',stockQuantity:0}]}]);await assert.rejects(h.load('lib/paystack/server.ts').initializePaystackCheckout(input([{productId:'p1',variantId:'green',quantity:1}])),/STOCK_CHECK_PASSED/);assert.equal(h.calls.length,1);
}));

const otcId='storeLocation.4fcbd28b74494e7da7176525e63d73f4';
async function withOverride(id,fn){const old=process.env.DBK64_ONLINE_FULFILMENT_STORE_ID;process.env.DBK64_ONLINE_FULFILMENT_STORE_ID=id;try{await withEnv(fn);}finally{if(old===undefined)delete process.env.DBK64_ONLINE_FULFILMENT_STORE_ID;else process.env.DBK64_ONLINE_FULFILMENT_STORE_ID=old;}}
test('DBK174B explicit online store selects OTC rather than historical Main store',()=>withOverride(otcId,async()=>{
 const h=harness([row('',4)],[{_id:'p1',name:'Plant',price:100}],[{_id:otcId,name:'OTC Mall Branch'}]);
 await assert.rejects(h.load('lib/paystack/server.ts').initializePaystackCheckout(input([{productId:'p1',quantity:1}])),/STOCK_CHECK_PASSED/);
 assert.equal(h.calls[0].args[1],otcId);
}));
test('DBK174B missing or wrong configured store fails before payment and does not fall back',()=>withOverride(otcId,async()=>{
 for(const stores of [[],[{_id:'storeLocation.other',name:'Wrong'}]]){
  const h=harness([row('',4)],[{_id:'p1',name:'Plant',price:100}],stores);
  await assert.rejects(h.load('lib/paystack/server.ts').initializePaystackCheckout(input([{productId:'p1',quantity:1}])),/Configured online fulfilment store is unavailable/);assert.equal(h.calls.length,0);
 }
}));
