const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const root=path.resolve(__dirname,'..');const wa='254716000000';const product={id:'glue',name:'Big Hot Melt Glue Sticks',slug:'glue-sticks',price:20,stockQuantity:50,variants:false};
function harness(){let order=null,cartRows=[],shortlist=[],viewed=null,pending=null,pendingVariant=null,deliveryContext=null,review=null,last='',mode='bot',calls=0,quotes=0,modelCalls=0;const cache=new Map();
  const db=async(parts,...v)=>{const q=parts.join('?');
    if(q.includes('SELECT mode'))return [{mode,delivery_context:deliveryContext,staff_review_reason:review}];
    if(q.includes('SET delivery_context=NULL')){deliveryContext=null;if(review==='Delivery quote')review=null;return [];}
    if(q.includes('SET delivery_context=')){deliveryContext=JSON.parse(v[0]);if(review!=='Wholesale enquiry')review=deliveryContext.method?'Delivery quote':review==='Delivery quote'?null:review;return [];}
    if(q.includes('SET staff_review_reason=NULL')){review=null;return [];}
    if(q.includes('SET staff_review_reason=')){if(review!=='Wholesale enquiry')review=v[0];return [];}
    if(q.includes('FROM public.dbk159_wa_outbound'))return last?[{message_text:last}]:[];
    if(q.includes('SELECT content'))return [{content:Object.fromEntries(['tone','business','delivery','returns','payments','products','examples','handover'].map(k=>[k,k==='delivery'?'Tharaka-Nithi = 250 Shillings\nNairobi = 150 Shillings\nMachakos = 200 Shillings':'test']))}];
    if(q.includes("SET mode='human'")){mode='human';return [];}
    if(q.includes('SELECT products_json'))return [{products_json:[product],synced_at:new Date().toISOString()}];
    if(q.includes('SELECT product_id,quantity,variant_id'))return cartRows;
    if(q.includes('SELECT pending_variant_product_id'))return pendingVariant?[pendingVariant]:[];
    if(q.includes('SELECT pending_purchase_product_id'))return pending?[pending]:[];
    if(q.includes('SET pending_purchase_product_id=NULL')){pending=null;return [];}
    if(q.includes('SET pending_variant_product_id=NULL')){pendingVariant=null;return q.includes('RETURNING wa_id')?[{wa_id:wa}]:[];}
    if(q.includes('SET pending_variant_product_id=')){pendingVariant={pending_variant_product_id:v[0],pending_variant_quantity:v[1],pending_variant_ids:JSON.parse(v[2])};return [];}
    if(q.includes("SET pending_purchase_stage='quantity'")){if(pending)pending.pending_purchase_stage='quantity';return [];}
    if(q.includes("SET pending_purchase_product_id=")&&q.includes("pending_purchase_stage='quantity'")){pending={pending_purchase_product_id:v[0],pending_purchase_stage:'quantity'};return [];}
    if(q.includes("SET pending_purchase_product_id=")&&q.includes("pending_purchase_stage='offer'")){pending={pending_purchase_product_id:v[0],pending_purchase_stage:'offer'};return [];}
    if(q.includes('INSERT INTO public.dbk155_wa_shortlists')){shortlist=JSON.parse(v[1]);return [];}
    if(q.includes('SELECT product_ids'))return [{product_ids:shortlist}];
    if(q.includes('INSERT INTO public.dbk36_wa_carts')){viewed=v[1];return [];}
    if(q.includes('UPDATE public.dbk36_wa_carts')){viewed=v[0];return [];}
    if(q.includes('SELECT last_viewed_product_id'))return [{last_viewed_product_id:viewed}];
    if(q.includes('INSERT INTO public.dbk36_wa_cart_items')){const existing=cartRows.find(r=>r.product_id===v[1]);if(existing){if(existing.variant_id!==v[3])return [];existing.quantity+=v[2];return [{quantity:existing.quantity}];}cartRows.push({product_id:v[1],quantity:v[2],variant_id:v[3]});return [{quantity:v[2]}];}
    throw Error('Unexpected SQL: '+q);
  };
  const payments={productionCustomerOrder:async()=>order,cancelProductionQuote:async()=>{if(order?.status==='quoted')order=null;return false;},createProductionCheckout:async input=>{if(order&&['starting','prompt_sent','review_required'].includes(order.status))return {reference:order.reference,status:order.status,amountKes:order.amount_kes};if(order?.status==='quoted'&&Date.parse(order.expires_at)>Date.now()){if(order.amount_kes!==input.amountKes||JSON.stringify(order.cart_snapshot)!==JSON.stringify(input.cart))throw Error('ACTIVE_QUOTE_MISMATCH');return {reference:order.reference,status:'quoted',amountKes:order.amount_kes};}quotes++;order={reference:input.reference,amount_kes:input.amountKes,status:'quoted',expires_at:new Date(Date.now()+600000).toISOString(),pickup_confirmed_at:null,cart_snapshot:input.cart};return {reference:order.reference,status:'quoted',amountKes:order.amount_kes};},selectProductionPayer:async(w,ref,payer)=>{assert.equal(w,wa);assert.equal(ref,order.reference);assert.equal(order.status,'quoted');order.payer_phone=payer;return order;},suspendProductionPickup:async(w,ref)=>{assert.equal(ref,order.reference);if(order.status!=='quoted')return false;order.pickup_confirmed_at=null;order.payer_phone=null;return true;},confirmProductionPickup:async()=>{if(order?.status!=='quoted')return null;order.pickup_confirmed_at=new Date().toISOString();order.payer_phone=null;return order;},payProductionCheckout:async(w,expected)=>{assert.equal(w,wa);assert.equal(expected.reference,order.reference);assert.equal(expected.payer,order.payer_phone||wa);assert.equal(order.status,'quoted');assert.ok(order.pickup_confirmed_at);calls++;order.status='prompt_sent';return {amountKes:order.amount_kes};}};
  function load(file){if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});assert.equal(out.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);const req=id=>{if(id==='server-only')return {};if(id==='@neondatabase/serverless')return {neon:()=>db};if(id==='@/sanity/lib/catalog')return {getStoreProducts:async()=>[product]};if(id==='@/lib/db/dbk36-production-payments')return payments;if(id==='@/lib/shipping-server')return {getActiveDeliveryZones:async()=>[{id:'within-cbd',label:'Within CBD',fee:100,active:true},{id:'outside-cbd-matatu',label:'Outside CBD via Matatu',fee:150,active:true},{id:'long-distance-matatu',label:'Long Distance Matatu',fee:350,active:true}]};if(id==='./dbk156-shopping-ai')return {planShopping:async()=>{modelCalls++;return {intent:'clarify',query:'',option:0,message:'I cannot send the M-PESA prompt myself.'};},suggestDeliveryCounty:async()=>{modelCalls++;return 'Tharaka Nithi';}};if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'));return require(id);};new Function('require','module','exports',out.outputText)(req,m,m.exports);return m.exports;}
  const {handleProductionChat}=load(path.join(root,'lib/whatsapp/dbk36-production-chat.ts'));return {say:async text=>{const a=await handleProductionChat(wa,text);last=a.reply;return a.reply;},setCart:()=>{cartRows=[{product_id:'glue',quantity:1,variant_id:''}];},stats:()=>({calls,quotes,modelCalls,mode}),review:()=>review,context:()=>deliveryContext,cart:()=>cartRows,setLast:v=>{last=v;},setOrder:v=>{order=v;}};
}
process.env.DBK36_WA_PRODUCTION_CHAT_ENABLED='YES';process.env.DBK100_WA_AI_ENABLED='YES';process.env.DBK164_PROMOTION_ENABLED='NO';
test('actual chat: customer transcript routes through cart, quote, pickup, STK once',async()=>{const h=harness();assert.match(await h.say('SEARCH glue sticks'),/Big Hot Melt/);assert.match(await h.say('Yes Mpesa prompt/stk push to my number 0716000000'),/How many/);assert.match(await h.say('One'),/added 1/);assert.match(await h.say('Place order'),/KES 20.*collect/);assert.match(await h.say('Send the mpesa prompt now'),/collect.*delivery/);assert.equal(h.stats().calls,0);assert.match(await h.say('I will collect'),/KES 20/);assert.match(await h.say('Send the mpesa prompt now'),/requested.*KES 20/);assert.match(await h.say('Send the mpesa prompt now'),/do not pay again/);assert.deepEqual(h.stats(),{calls:1,quotes:1,modelCalls:0,mode:'bot'});});
test('yes only after exact current pickup payment question; other phone and questions never charge',async()=>{const h=harness();h.setCart();await h.say('Place order');await h.say('I will collect');assert.match(await h.say('Send the mpesa prompt to my number 0716999999'),/temporarily handled/);assert.equal(h.stats().calls,0);await h.say('I will collect');assert.match(await h.say('Send the M-PESA prompt?'),/No (?:new )?payment/);assert.equal(h.stats().calls,0);await h.say('I will collect');assert.match(await h.say('Yes please'),/requested/);assert.equal(h.stats().calls,1);});
test('delivery town maps to county and configured rates without STK or takeover',async()=>{const h=harness();h.setCart();await h.say('Place order');assert.match(await h.say('Delivery'),/town or area/);assert.match(await h.say('Chuka'),/Tharaka Nithi County/);assert.equal(h.stats().mode,'bot');assert.equal(h.context().county,'Tharaka Nithi');assert.equal(h.stats().calls,0);assert.equal(h.stats().modelCalls,0);});
test('unknown town inference requires customer confirmation; never autocharges',async()=>{const h=harness();assert.match(await h.say('Deliver to Exampletown'),/Is your delivery county Tharaka Nithi/);assert.equal(h.stats().mode,'bot');assert.match(await h.say('Yes please'),/Delivery options for Exampletown \(Tharaka Nithi County\)/);assert.equal(h.stats().calls,0);assert.equal(h.stats().mode,'bot');});
test('named payment request and phone alone advance quantity without sending STK',async()=>{const h=harness();assert.match(await h.say('I want to pay for the big melt glue stick'),/How many/);assert.match(await h.say('Mpesa prompt please to my phone number'),/How many/);assert.match(await h.say('0716000000'),/How many/);assert.match(await h.say('One'),/added 1/);assert.equal(h.stats().calls,0);assert.equal(h.stats().modelCalls,0);});

test('DBK178 alternate payer selection requires a fresh explicit confirmation and never duplicates a pending attempt',async()=>{
 const old=process.env.DBK178_ALTERNATE_PAYER_ENABLED;process.env.DBK178_ALTERNATE_PAYER_ENABLED='YES';
 try{const h=harness();h.setCart();await h.say('Place order');assert.match(await h.say('Collect from store'),/use another number/);
 assert.match(await h.say('I want to use a different mpesa number'),/0712345678 or 0112345678/);
 assert.match(await h.say('12345'),/0712345678 or 0112345678/);assert.equal(h.stats().calls,0);
 assert.match(await h.say('0112345678'),/KES 20.*0112345678/);assert.equal(h.stats().calls,0);
 assert.match(await h.say('Send M-PESA prompt'),/requested.*KES 20/);assert.equal(h.stats().calls,1);
 assert.match(await h.say('I want to use another number'),/awaiting confirmation/);assert.equal(h.stats().calls,1);
 assert.match(await h.say('0712345678'),/awaiting confirmation/);assert.equal(h.stats().calls,1);
 }finally{if(old===undefined)delete process.env.DBK178_ALTERNATE_PAYER_ENABLED;else process.env.DBK178_ALTERNATE_PAYER_ENABLED=old;}
});
test('DBK178 a different payer can be selected then switched back before any STK',async()=>{
 const old=process.env.DBK178_ALTERNATE_PAYER_ENABLED;process.env.DBK178_ALTERNATE_PAYER_ENABLED='YES';
 try{const h=harness();h.setCart();await h.say('Place order');await h.say('Collect from store');
 await h.say('use another number');assert.match(await h.say('+254112345678'),/0112345678/);
 assert.match(await h.say('use my WhatsApp number'),/your WhatsApp number/);assert.equal(h.stats().calls,0);
 assert.match(await h.say('yes'),/requested/);assert.equal(h.stats().calls,1);
 }finally{if(old===undefined)delete process.env.DBK178_ALTERNATE_PAYER_ENABLED;else process.env.DBK178_ALTERNATE_PAYER_ENABLED=old;}
});
test('DBK178 screenshot transcript retains Tala and existing quote; delivery fee is never the ecommerce fallback',async()=>{
 const h=harness();h.setCart();const quote=await h.say('I want to pay');const ref=quote.match(/DBKWA[A-Z0-9]{7}/)[0];
 assert.match(await h.say('Tala,Machakos'),/Tala \(Machakos County\).*Standard delivery — KES 200/s);
 assert.match(await h.say('Machakos county'),/Tala \(Machakos County\)/);
 assert.match(await h.say('Add to county'),/Which county should I use for Tala/);
 assert.match(await h.say('Add Machakos county to my delivery location for my order'),/Standard delivery — KES 200/);
 assert.match(await h.say('Yes'),/standard delivery, store collection or a rider quote/);
 const estimated=await h.say('I want to pay for this order');assert.match(estimated,/Products: KES 20.*Delivery: KES 200.*Estimated total: KES 220/s);assert.equal(h.stats().calls,0);
 assert.match(await h.say('Collect from store'),new RegExp(ref));assert.equal(h.stats().quotes,1);assert.equal(h.stats().calls,0);
 assert.match(await h.say('Send M-PESA prompt'),/requested.*KES 20/);assert.equal(h.stats().calls,1);
});
test('DBK178 delivery request invalidates pickup consent but preserves reference and prevents STK',async()=>{
 const h=harness();h.setCart();const first=await h.say('Place order');const ref=first.match(/DBKWA[A-Z0-9]{7}/)[0];await h.say('Collect from store');
 await h.say('Delivery');assert.match(await h.say('Send M-PESA prompt'),/delivery cost and final total/);assert.equal(h.stats().calls,0);
 assert.match(await h.say('Tala'),/Standard delivery — KES 200/);assert.match(await h.say('Collect from store'),new RegExp(ref));assert.equal(h.stats().quotes,1);
});
