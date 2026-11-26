const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const root=path.resolve(__dirname,'..');const wa='254716000000';const product={id:'glue',name:'Big Hot Melt Glue Sticks',slug:'glue-sticks',price:20,stockQuantity:50,variants:false};
const products=[product,{id:'pampas',name:'55 Cm Artificial Pampas Grass',slug:'pampas',price:50,stockQuantity:10,variants:false},{id:'vase',name:'Donut Vase',slug:'donut-vase',price:700,stockQuantity:3,variants:false},{id:'pillow',name:'Knot Pillow',slug:'knot-pillow',price:800,stockQuantity:4,variants:false},{id:'natural',name:'Natural Pampas Grass',slug:'natural-pampas',price:50,stockQuantity:10,variants:false}];
function harness(){let order=null,cartRows=[],shortlist=[],viewed=null,pending=null,last='',mode='bot',calls=0,quotes=0,modelCalls=0;const cache=new Map();
  const db=async(parts,...v)=>{const q=parts.join('?');
    if(q.includes('SELECT mode'))return [{mode}];
    if(q.includes('FROM public.dbk36_wa_messages')&&q.includes('SELECT message_text'))return [];
    if(q.includes('FROM public.dbk159_wa_outbound'))return last?[{message_text:last}]:[];
    if(q.includes('SELECT content'))return [{content:Object.fromEntries(['tone','business','delivery','returns','payments','products','examples','handover'].map(k=>[k,k==='delivery'?'Tharaka-Nithi: staff quote required':'test']))}];
    if(q.includes("SET mode='human'")){mode='human';return [];}
    if(q.includes('SELECT products_json'))return [{products_json:products,synced_at:new Date().toISOString()}];
    if(q.includes('SELECT product_id,quantity,variant_id'))return cartRows;
    if(q.includes('SELECT pending_variant_product_id'))return [];
    if(q.includes('SELECT pending_purchase_product_id'))return pending?[pending]:[];
    if(q.includes('SET pending_purchase_product_id=NULL')){pending=null;return [];}
    if(q.includes('SET pending_variant_product_id=NULL'))return [];
    if(q.includes("SET pending_purchase_stage='quantity'")){if(pending)pending.pending_purchase_stage='quantity';return [];}
    if(q.includes("SET pending_purchase_product_id=")&&q.includes("pending_purchase_stage='quantity'")){pending={pending_purchase_product_id:v[0],pending_purchase_stage:'quantity'};return [];}
    if(q.includes("SET pending_purchase_product_id=")&&q.includes("pending_purchase_stage='offer'")){pending={pending_purchase_product_id:v[0],pending_purchase_stage:'offer'};return [];}
    if(q.includes('INSERT INTO public.dbk155_wa_shortlists')){shortlist=JSON.parse(v[1]);return [];}
    if(q.includes('DELETE FROM public.dbk155_wa_shortlists')){shortlist=[];pending=null;return [];}
    if(q.includes('SELECT product_ids'))return [{product_ids:shortlist}];
    if(q.includes('INSERT INTO public.dbk36_wa_carts')){viewed=v[1];return [];}
    if(q.includes('UPDATE public.dbk36_wa_carts')){viewed=v[0];return [];}
    if(q.includes('SELECT last_viewed_product_id'))return [{last_viewed_product_id:viewed}];
    if(q.includes('INSERT INTO public.dbk36_wa_cart_items')){cartRows=[{product_id:v[1],quantity:v[2],variant_id:v[3]}];return [{quantity:v[2]}];}
    throw Error('Unexpected SQL: '+q);
  };
  const payments={productionCustomerOrder:async()=>order,cancelProductionQuote:async()=>{if(order?.status==='quoted')order=null;return false;},createProductionCheckout:async input=>{quotes++;order={reference:input.reference,amount_kes:input.amountKes,status:'quoted',expires_at:new Date(Date.now()+600000).toISOString(),pickup_confirmed_at:null};return {reference:order.reference,status:'quoted',amountKes:order.amount_kes};},confirmProductionPickup:async()=>{if(order?.status!=='quoted')return null;order.pickup_confirmed_at=new Date().toISOString();return order;},payProductionCheckout:async()=>{assert.equal(order.status,'quoted');assert.ok(order.pickup_confirmed_at);calls++;order.status='prompt_sent';return {amountKes:order.amount_kes};}};
  function load(file){if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);const out=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});assert.equal(out.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);const req=id=>{if(id==='server-only')return {};if(id==='@neondatabase/serverless')return {neon:()=>db};if(id==='@/sanity/lib/catalog')return {getStoreProducts:async()=>products};if(id==='@/lib/db/dbk36-production-payments')return payments;if(id==='./dbk156-shopping-ai')return {planShopping:async(text)=>{modelCalls++;return {intent:'search',query:text,option:0,message:''};},suggestDeliveryCounty:async()=>{modelCalls++;return 'Tharaka Nithi';}};if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'));return require(id);};new Function('require','module','exports',out.outputText)(req,m,m.exports);return m.exports;}
  const {handleProductionChat}=load(path.join(root,'lib/whatsapp/dbk36-production-chat.ts'));return {say:async (text,visual)=>{const a=await handleProductionChat(wa,text,visual);last=a.reply;return a.reply;},setCart:()=>{cartRows=[{product_id:'glue',quantity:1,variant_id:''}];},stats:()=>({calls,quotes,modelCalls,mode}),setLast:v=>{last=v;},setOrder:v=>{order=v;}};
}
process.env.DBK36_WA_PRODUCTION_CHAT_ENABLED='YES';process.env.DBK100_WA_AI_ENABLED='YES';process.env.DBK164_PROMOTION_ENABLED='NO';

test('mixed language misspelling resolves named vase and actual price without model',async()=>{const h=harness();const r=await h.say('Donate vace ni how much');assert.match(r,/Donut Vase.*KES 700/);assert.equal(h.stats().modelCalls,0);assert.equal(h.stats().calls,0);});
test('multi-product request shows independent matches and excludes unrelated natural grass',async()=>{const h=harness();const r=await h.say('Need artificial pampas grass and the donuts vace');assert.match(r,/55 Cm Artificial Pampas Grass.*KES 50/);assert.match(r,/Donut Vase.*KES 700/);assert.doesNotMatch(r,/Natural Pampas/);assert.equal(h.stats().calls,0);});
test('partial results name the missing product instead of pretending both are found',async()=>{const h=harness();const r=await h.say('Artificial pampas grass and shell pillows');assert.match(r,/55 Cm Artificial Pampas Grass/);assert.match(r,/haven’t confirmed a match for: shell pillows/);assert.equal(h.stats().calls,0);});
test('wholesale request routes to staff without an invented wholesale rate or payment',async()=>{const h=harness();await h.say('Donate vace ni how much');assert.match(await h.say('At wholesale because I want to resale'),/handed them this chat/);assert.equal(h.stats().mode,'human');assert.equal(h.stats().calls,0);});
test('future tense and Kiswahili human requests are real takeovers',async()=>{for(const phrase of ['Tomorrow will talk to a human being','Naomba kuongea na mtu']){const h=harness();assert.match(await h.say(phrase),/handed this chat/);assert.equal(h.stats().mode,'human');assert.equal(h.stats().modelCalls,0);}});
test('second consecutive no-match transfers to staff, including a pointer after a miss',async()=>{for(const next of ['unicorn statue','This']){const h=harness();assert.match(await h.say('Shell pillows'),/couldn’t find a confirmed/);assert.match(await h.say(next),/handed this conversation/);assert.equal(h.stats().mode,'human');assert.equal(h.stats().calls,0);}});
test('deictic message alone uses known shortlist without silently adding a product',async()=>{const h=harness();await h.say('SEARCH glue sticks');assert.match(await h.say('This'),/Do you mean Big Hot Melt/);assert.equal(h.stats().calls,0);});
test('knotted and knot terminology matches actual catalogue',async()=>{const h=harness();assert.match(await h.say('Knotted pillows'),/Knot Pillow/);assert.equal(h.stats().calls,0);});
test('delivery typo is routed to staff and not an invented payment amount',async()=>{const h=harness();assert.match(await h.say('Delivary to Bungoma'),/Bungoma.*flagged/);assert.equal(h.stats().mode,'human');assert.equal(h.stats().calls,0);});

test('frustration about automation acknowledges it truthfully and hands off',async()=>{const h=harness();assert.match(await h.say('It seems am talking to Ai'),/automated shopping assistant.*handed your chat/);assert.equal(h.stats().mode,'human');assert.equal(h.stats().calls,0);});

test('image-derived query is read-only even when caption is an explicit payment command',async()=>{const h=harness();h.setCart();await h.say('Place order');await h.say('I will collect');const r=await h.say('Send the M-PESA prompt now',{query:'cream ceramic donut vase'});assert.match(r,/may match the photo/);assert.match(r,/Donut Vase.*KES 700/);assert.equal(h.stats().calls,0);});
test('unmatched image hands over without payment or fabricated product',async()=>{const h=harness();const r=await h.say('Nataka hizi',{query:'unicorn statue'});assert.match(r,/handed this chat/);assert.equal(h.stats().mode,'human');assert.equal(h.stats().calls,0);});
test('photo shortlist supports natural pointer follow-up without adding a product',async()=>{const h=harness();await h.say('Nataka hizi',{query:'donut vase'});assert.match(await h.say('Hizi ziko?'),/Do you mean Donut Vase/);assert.equal(h.stats().calls,0);});
