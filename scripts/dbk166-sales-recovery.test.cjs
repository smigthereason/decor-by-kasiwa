const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const root=path.resolve(__dirname,'..');const wa='254716000000';const product={id:'glue',name:'Big Hot Melt Glue Sticks',slug:'glue-sticks',price:20,stockQuantity:50,variants:false};
const products=[product,{id:'rose35',name:'3.5 Cm Rose Petals',slug:'rose-35',price:9,stockQuantity:72,variants:true,variantOptions:[{id:'white',label:'White',price:9,stockQuantity:40},{id:'pink',label:'Hot Pink',price:9,stockQuantity:32}]},{id:'rose55',name:'5.5 Cm Rose Petals',slug:'rose-55',price:15,stockQuantity:4,variants:false},{id:'pampas',name:'55 Cm Artificial Pampas Grass',slug:'pampas',price:50,stockQuantity:10,variants:false},{id:'vase',name:'Donut Vase',slug:'donut-vase',price:700,stockQuantity:3,variants:false},{id:'pillow',name:'Knot Pillow',slug:'knot-pillow',price:800,stockQuantity:4,variants:false},{id:'natural',name:'Natural Pampas Grass',slug:'natural-pampas',price:50,stockQuantity:10,variants:false}];
function harness(extra=[]){const catalogue=[...products,...extra];let order=null,cartRows=[],shortlist=[],viewed=null,pending=null,pendingVariant=null,deliveryContext=null,review=null,last='',mode='bot',calls=0,quotes=0,modelCalls=0;const cache=new Map();
  const db=async(parts,...v)=>{const q=parts.join('?');
    if(q.includes('SELECT mode'))return [{mode,delivery_context:deliveryContext,staff_review_reason:review}];
    if(q.includes('SET delivery_context=NULL')){deliveryContext=null;if(review==='Delivery quote')review=null;return [];}
    if(q.includes('SET delivery_context=')){deliveryContext=JSON.parse(v[0]);if(review!=='Wholesale enquiry')review=deliveryContext.method?'Delivery quote':review==='Delivery quote'?null:review;return [];}
    if(q.includes('SET staff_review_reason=NULL')){review=null;return [];}
    if(q.includes('SET staff_review_reason=')){if(review!=='Wholesale enquiry')review=v[0];return [];}
    if(q.includes('FROM public.dbk36_wa_messages')&&q.includes('SELECT message_text'))return [];
    if(q.includes('FROM public.dbk159_wa_outbound'))return last?[{message_text:last}]:[];
    if(q.includes('SELECT content'))return [{content:Object.fromEntries(['tone','business','delivery','returns','payments','products','examples','handover'].map(k=>[k,k==='delivery'?'Tharaka-Nithi: staff quote required':'test']))}];
    if(q.includes("SET mode='human'")){mode='human';return [];}
    if(q.includes('SELECT products_json'))return [{products_json:catalogue,synced_at:new Date().toISOString()}];
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
    if(q.includes('DELETE FROM public.dbk155_wa_shortlists')){shortlist=[];pending=null;return [];}
    if(q.includes('SELECT product_ids'))return [{product_ids:shortlist}];
    if(q.includes('INSERT INTO public.dbk36_wa_carts')){viewed=v[1];return [];}
    if(q.includes('UPDATE public.dbk36_wa_carts')){viewed=v[0];return [];}
    if(q.includes('SELECT last_viewed_product_id'))return [{last_viewed_product_id:viewed}];
    if(q.includes('INSERT INTO public.dbk36_wa_cart_items')){const existing=cartRows.find(r=>r.product_id===v[1]);if(existing){if(existing.variant_id!==v[3])return [];existing.quantity+=v[2];return [{quantity:existing.quantity}];}cartRows.push({product_id:v[1],quantity:v[2],variant_id:v[3]});return [{quantity:v[2]}];}
    throw Error('Unexpected SQL: '+q);
  };
  const payments={productionCustomerOrder:async()=>order,cancelProductionQuote:async()=>{if(order?.status==='quoted')order=null;return false;},createProductionCheckout:async input=>{if(order&&['starting','prompt_sent','review_required'].includes(order.status))return {reference:order.reference,status:order.status,amountKes:order.amount_kes};if(order?.status==='quoted'&&Date.parse(order.expires_at)>Date.now()){if(order.amount_kes!==input.amountKes||JSON.stringify(order.cart_snapshot)!==JSON.stringify(input.cart))throw Error('ACTIVE_QUOTE_MISMATCH');return {reference:order.reference,status:'quoted',amountKes:order.amount_kes};}quotes++;order={reference:input.reference,amount_kes:input.amountKes,status:'quoted',expires_at:new Date(Date.now()+600000).toISOString(),pickup_confirmed_at:null,cart_snapshot:input.cart};return {reference:order.reference,status:'quoted',amountKes:order.amount_kes};},confirmProductionPickup:async()=>{if(order?.status!=='quoted')return null;order.pickup_confirmed_at=new Date().toISOString();return order;},payProductionCheckout:async()=>{assert.equal(order.status,'quoted');assert.ok(order.pickup_confirmed_at);calls++;order.status='prompt_sent';return {amountKes:order.amount_kes};}};
  function load(file){if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});assert.equal(out.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);const req=id=>{if(id==='server-only')return {};if(id==='@neondatabase/serverless')return {neon:()=>db};if(id==='@/sanity/lib/catalog')return {getStoreProducts:async()=>products};if(id==='@/lib/db/dbk36-production-payments')return payments;if(id==='@/lib/shipping-server')return {getActiveDeliveryZones:async()=>[{id:'within-cbd',label:'Within CBD',fee:100,active:true},{id:'outside-cbd-matatu',label:'Outside CBD via Matatu',fee:150,active:true},{id:'long-distance-matatu',label:'Long Distance Matatu',fee:350,active:true}]};if(id==='./dbk156-shopping-ai')return {planShopping:async(text)=>{modelCalls++;return {intent:'search',query:text,option:0,message:''};},suggestDeliveryCounty:async()=>{modelCalls++;return 'Tharaka Nithi';}};if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'));return require(id);};new Function('require','module','exports',out.outputText)(req,m,m.exports);return m.exports;}
  const {handleProductionChat}=load(path.join(root,'lib/whatsapp/dbk36-production-chat.ts'));return {say:async (text,visual)=>{const a=await handleProductionChat(wa,text,visual);last=a.reply;return a.reply;},setCart:()=>{cartRows=[{product_id:'glue',quantity:1,variant_id:''}];},stats:()=>({calls,quotes,modelCalls,mode}),review:()=>review,context:()=>deliveryContext,cart:()=>cartRows,setLast:v=>{last=v;},setOrder:v=>{order=v;}};
}
process.env.DBK36_WA_PRODUCTION_CHAT_ENABLED='YES';process.env.DBK100_WA_AI_ENABLED='YES';process.env.DBK164_PROMOTION_ENABLED='NO';

test('mixed language misspelling resolves named vase and actual price without model',async()=>{const h=harness();const r=await h.say('Donate vace ni how much');assert.match(r,/Donut Vase.*KES 700/);assert.equal(h.stats().modelCalls,0);assert.equal(h.stats().calls,0);});
test('multi-product request shows independent matches and excludes unrelated natural grass',async()=>{const h=harness();const r=await h.say('Need artificial pampas grass and the donuts vace');assert.match(r,/55 Cm Artificial Pampas Grass.*KES 50/);assert.match(r,/Donut Vase.*KES 700/);assert.doesNotMatch(r,/Natural Pampas/);assert.equal(h.stats().calls,0);});
test('partial results name the missing product instead of pretending both are found',async()=>{const h=harness();const r=await h.say('Artificial pampas grass and shell pillows');assert.match(r,/55 Cm Artificial Pampas Grass/);assert.match(r,/haven’t confirmed a match for: shell pillows/);assert.equal(h.stats().calls,0);});
test('wholesale review is flagged without an invented wholesale rate or payment',async()=>{const h=harness();await h.say('Donate vace ni how much');assert.match(await h.say('At wholesale because I want to resale'),/flagged this chat/);assert.equal(h.stats().mode,'bot');assert.equal(h.review(),'Wholesale enquiry');assert.equal(h.stats().calls,0);});
test('future tense and Kiswahili human requests are real takeovers',async()=>{for(const phrase of ['Tomorrow will talk to a human being','Naomba kuongea na mtu']){const h=harness();assert.match(await h.say(phrase),/handed this chat/);assert.equal(h.stats().mode,'human');assert.equal(h.stats().modelCalls,0);}});
test('second consecutive no-match flags staff review, including a pointer after a miss',async()=>{for(const next of ['unicorn statue','This']){const h=harness();assert.match(await h.say('Shell pillows'),/couldn’t find a confirmed/);assert.match(await h.say(next),/flagged this conversation/);assert.equal(h.stats().mode,'bot');assert.equal(h.review(),'Product search');assert.equal(h.stats().calls,0);}});
test('deictic message alone uses known shortlist without silently adding a product',async()=>{const h=harness();await h.say('SEARCH glue sticks');assert.match(await h.say('This'),/Do you mean Big Hot Melt/);assert.equal(h.stats().calls,0);});
test('knotted and knot terminology matches actual catalogue',async()=>{const h=harness();assert.match(await h.say('Knotted pillows'),/Knot Pillow/);assert.equal(h.stats().calls,0);});
test('delivery typo shows delivery options and no invented payment amount',async()=>{const h=harness();assert.match(await h.say('Delivary to Bungoma'),/Delivery options for Bungoma/);assert.equal(h.stats().mode,'bot');assert.equal(h.stats().calls,0);});

test('frustration about automation acknowledges it truthfully and flags review',async()=>{const h=harness();assert.match(await h.say('It seems am talking to Ai'),/automated shopping assistant.*flagged this chat/);assert.equal(h.stats().mode,'bot');assert.equal(h.review(),'Customer needs assistance');assert.equal(h.stats().calls,0);});

test('image-derived query is read-only even when caption is an explicit payment command',async()=>{const h=harness();h.setCart();await h.say('Place order');await h.say('I will collect');const r=await h.say('Send the M-PESA prompt now',{query:'cream ceramic donut vase'});assert.match(r,/may match the photo/);assert.match(r,/Donut Vase.*KES 700/);assert.equal(h.stats().calls,0);});
test('unmatched image flags review without payment or fabricated product',async()=>{const h=harness();const r=await h.say('Nataka hizi',{query:'unicorn statue'});assert.match(r,/flagged this chat/);assert.equal(h.stats().mode,'bot');assert.equal(h.review(),'Photo matching');assert.equal(h.stats().calls,0);});
test('photo shortlist supports natural pointer follow-up without adding a product',async()=>{const h=harness();await h.say('Nataka hizi',{query:'donut vase'});assert.match(await h.say('Hizi ziko?'),/Do you mean Donut Vase/);assert.equal(h.stats().calls,0);});

test('DBK167 exact customer named order keeps decimal dimension, quantity and option',async()=>{
 const h=harness();await h.say('SEARCH rose petals');
 const r=await h.say('Place an order for the 3.5 rose petals\nJust 1 please');
 assert.match(r,/3.5 Cm Rose Petals has options/);assert.match(r,/White.*KES 9/);assert.doesNotMatch(r,/5.5 Cm Rose/);assert.equal(h.cart().length,0);
 const added=await h.say('White');assert.match(added,/added 1 × 3.5 Cm Rose Petals \(White\)/);assert.match(added,/Cart total: KES 9/);assert.equal(h.cart()[0].quantity,1);assert.equal(h.cart()[0].variant_id,'white');
 assert.match(await h.say('Yes'),/Your order total is KES 9/);assert.equal(h.stats().calls,0);
});
test('DBK167 cart shows retained items rather than silently charging unexpected amount',async()=>{
 const h=harness();h.setCart();const r=await h.say('Place an order for the 3.5 rose petals\nJust 1 please');assert.match(r,/Which would you like/);
 const added=await h.say('White');assert.match(added,/Big Hot Melt Glue Sticks/);assert.match(added,/Cart total: KES 29/);assert.equal(h.stats().calls,0);
});
test('DBK167 Nairobi quote, rider review and continuing product enquiries before staff assignment',async()=>{
 const h=harness();h.setCart();await h.say('Place order');const rates=await h.say('Nairobi please');assert.match(rates,/Within CBD — KES 100/);assert.match(rates,/Outside CBD via Matatu — KES 150/);assert.match(rates,/rider quote/);assert.equal(h.stats().mode,'bot');
 assert.match(await h.say('Rider'),/flagged.*Nairobi/);assert.equal(h.review(),'Delivery quote');assert.equal(h.stats().mode,'bot');assert.match(await h.say('SEARCH glue sticks'),/Big Hot Melt/);
 assert.match(await h.say('Hey\nI want to pay for my order'),/delivery cost and final total/);assert.equal(h.stats().calls,0);
 assert.match(await h.say('Will collect from the store'),/Collection confirmed/);assert.equal(h.context(),null);assert.equal(h.review(),null);assert.match(await h.say('Yes'),/requested.*KES 20/);assert.equal(h.stats().calls,1);
});
test('DBK167 wholesale review can browse but cannot initiate retail charge without explicit choice',async()=>{
 const h=harness();h.setCart();await h.say('At wholesale because I want to resale');assert.match(await h.say('SEARCH glue sticks'),/Big Hot Melt/);assert.match(await h.say('Place order'),/wholesale rate/);assert.equal(h.stats().calls,0);assert.equal(h.stats().mode,'bot');assert.match(await h.say('retail please'),/Retail pricing confirmed/);assert.match(await h.say('Place order'),/Your order total/);
});

test('DBK167 existing shortlist purchase wording is preserved',async()=>{const h=harness();await h.say('SEARCH glue sticks');const r=await h.say('I want to buy this one');assert.match(r,/added 1|How many/);assert.equal(h.stats().calls,0);});
test('DBK167 explicit human request still stops automation',async()=>{const h=harness();await h.say('I want to talk to a real person');assert.equal(h.stats().mode,'human');assert.match(await h.say('SEARCH glue sticks'),/staff member will assist/);assert.equal(h.stats().calls,0);});

test('DBK168 size-specific glue lookup handles spelling and does not substitute other sizes',async()=>{const fixture=[{id:'glue7',name:'7 Mm Gluestick',slug:'7mm-gluestick',price:12,stockQuantity:50,variants:false},{id:'glue11',name:'11 Mm Glue Stick',slug:'11mm-glue-stick',price:18,stockQuantity:50,variants:false}];for(const q of ['7 mm glue stick','7mm gluestick','Do you have 7 mm glue sticks?','SEARCH 7 mm glue stick']){const h=harness(fixture);const r=await h.say(q);assert.match(r,/7 Mm Gluestick/);assert.doesNotMatch(r,/11 Mm|Big Hot Melt/);assert.equal(h.stats().calls,0);}const h=harness(fixture);assert.match(await h.say('8 mm glue stick'),/couldn’t find/i);});

test('DBK172 exact A3 search never falls back to A1 or A2',async()=>{const h=harness(['A1','A2','A3'].map(size=>({id:size,name:`${size} Picture Frame`,slug:size.toLowerCase(),price:100,stockQuantity:5,variants:false})));const result=await h.say('Do you have A3?');assert.match(result,/A3 Picture Frame/);assert.doesNotMatch(result,/A1 Picture Frame|A2 Picture Frame/);assert.equal(h.stats().modelCalls,0);assert.equal(h.stats().calls,0);});
test('DBK172 photo delivery request keeps Kitengela context and requires product confirmation',async()=>{const h=harness();const result=await h.say('I want these kindly delivered to kitengela');assert.match(result,/confirm the products and quantity/);assert.match(result,/kitengela/);assert.equal(h.context().county,'Kajiado');assert.equal(h.review(),'Photo and delivery request');assert.equal(h.stats().calls,0);assert.equal(h.cart().length,0);});
