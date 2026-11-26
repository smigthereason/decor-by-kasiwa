// Runs the actual production chat and planner with mocked Neon, catalogue and OpenAI.
// No external requests, customer data, or payment calls.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const image='https://cdn.sanity.io/images/p/d/a.jpg';
const item=(id,name,variants=false)=>({id,name,slug:id,price:4500,stockQuantity:4,variants,image:{asset:{url:image}}});
const products=[item('clock','3 IN 1 Mirror Wall Clocks'),item('mirror','Big Round Mirrors',[{id:'white',colour:'White',stockQuantity:2,price:4500,imageUrl:image},{id:'gold',colour:'Gold',stockQuantity:1,price:4700},{id:'black',colour:'Black',stockQuantity:0,price:4500}]),item('stickers','FAMILY 3D Mirror Acrylic Wall Letter Stickers'),item('tree','Cherry pot like tree')];
test('actual chat: AI search, photo, price and purchase preserve product context',async()=>{
  const cache=new Map();let shortlist=[],viewed=null,modelCalls=0,paymentCalls=0,cartWrites=0;const history=[];let pending=null,cartRow=null,quoteCancels=0,quoted=null,pickup=false;
  const db=async(strings,...values)=>{
    const q=strings.join('?');
    if(q.includes('SELECT mode'))return [{mode:'bot'}];
    if(q.includes('SELECT content'))return [];
    if(q.includes('SELECT products_json'))return [{products_json:products,synced_at:new Date().toISOString()}];
    if(q.includes('SELECT pending_variant_product_id'))return pending?[pending]:[];
    if(q.includes('SET pending_variant_product_id=NULL')){const prior=pending;pending=null;return prior?[{wa_id:'254700000000'}]:[];}
    if(q.includes('SET pending_variant_product_id=')){pending={pending_variant_product_id:values[0],pending_variant_quantity:values[1],pending_variant_ids:JSON.parse(values[2])};return [];}
    if(q.includes('SELECT product_id,quantity,variant_id'))return cartRow?[cartRow]:[];
    if(q.includes('SELECT product_ids'))return [{product_ids:shortlist}];
    if(q.includes('SELECT message_text'))return history.slice().reverse().map(message_text=>({message_text}));
    if(q.includes('INSERT INTO public.dbk155_wa_shortlists')){shortlist=JSON.parse(values[1]);return [];}
    if(q.includes('INSERT INTO public.dbk36_wa_carts')){viewed=values[1];return [];}
    if(q.includes('SELECT last_viewed_product_id'))return [{last_viewed_product_id:viewed}];
    if(q.includes('INSERT INTO public.dbk36_wa_cart_items')){cartWrites++;cartRow={product_id:values[1],quantity:values[2],variant_id:values[3]};return [{quantity:1}];}
    throw Error('Unexpected SQL: '+q);
  };
  function load(file){if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);
    const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,strict:true},reportDiagnostics:true});
    assert.equal(code.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0);
    const req=id=>{if(id==='server-only')return {};if(id==='@neondatabase/serverless')return {neon:()=>db};if(id==='@/sanity/lib/catalog')return {getStoreProducts:async()=>products};if(id==='@/lib/db/dbk36-production-payments')return new Proxy({},{get:(_,name)=>async(input)=>{if(name==='createProductionCheckout'){assert.equal(input.amountKes,4500);assert.equal(input.cart[0].variantId,'white');quoted=input;return {...input,status:'quoted'};}if(name==='confirmProductionPickup'){assert.ok(quoted);pickup=true;return {reference:quoted.reference,amount_kes:quoted.amountKes};}if(name==='payProductionCheckout'){assert.ok(pickup);paymentCalls++;return {amountKes:quoted.amountKes};}if(name==='cancelProductionQuote'){quoteCancels++;return false;}paymentCalls++;throw Error('Unexpected payment action');}});if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'));return require(id);};
    new Function('require','module','exports',code.outputText)(req,m,m.exports);return m.exports;
  }
  const oldFetch=global.fetch;const keys=['OPENAI_API_KEY','DBK100_WA_AI_ENABLED','DBK36_WA_PRODUCTION_CHAT_ENABLED'];const oldEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{process.env.OPENAI_API_KEY='test-key';process.env.DBK100_WA_AI_ENABLED='YES';process.env.DBK36_WA_PRODUCTION_CHAT_ENABLED='YES';
    global.fetch=async(url,opts)=>{assert.equal(url,'https://api.openai.com/v1/responses');modelCalls++;const body=JSON.parse(opts.body);assert.equal(body.store,false);const input=JSON.parse(body.input);assert.equal(body.text.format.type,'json_schema');const plan={intent:'search',query:input.message.includes('round')?'big round mirror':'mirror',option:0,message:''};return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify(plan)}]}]})};};
    const {handleProductionChat}=load(path.join(root,'lib/whatsapp/dbk36-production-chat.ts'));
    const say=async(text)=>{const answer=await handleProductionChat('254700000000',text);history.push(text);return answer;};
    const broad=await say("I'm looking for mirrors for my bedroom.");assert.match(broad.reply,/Big Round Mirrors/);assert.doesNotMatch(broad.reply,/Clock|Stickers|tree/);assert.equal(broad.images[0].url,image);
    const precise=await say('Do you have big round mirrors?');assert.deepEqual(shortlist,['mirror']);assert.equal(precise.images.length,1);
    const photo=await say('Can I see a picture?');assert.equal(photo.images[0].url,image);assert.match(photo.images[0].caption,/Big Round Mirrors/);
    assert.match((await say('How much is it?')).reply,/4,500/);
    const choices=await say("I'd like to buy one.");assert.match(choices.reply,/White/);assert.match(choices.reply,/Gold/);assert.doesNotMatch(choices.reply,/Black/);assert.equal(choices.images[0].url,image);
    assert.match((await say('Why does the team need to confirm?')).reply,/which option you prefer/);
    assert.match((await say('yes please')).reply,/Which would you like/);assert.equal(cartWrites,0);
    assert.match((await say('send M-PESA prompt')).reply,/No payment has been requested/);assert.equal(paymentCalls,0);
    assert.match((await say('White')).reply,/added 1 × Big Round Mirrors \(White\)/);assert.equal(cartWrites,1);assert.equal(quoteCancels,1);
    assert.match((await say('CART')).reply,/Big Round Mirrors \(White\).*4,500/);
    assert.match((await say('Place my order')).reply,/order total is KES 4,500/);
    assert.equal(paymentCalls,0);
    assert.match((await say('I will collect')).reply,/Collection confirmed/);
    assert.equal(paymentCalls,0);
    assert.match((await say('send M-PESA prompt')).reply,/requested an M-PESA prompt for KES 4,500/);
    assert.equal(modelCalls,2);assert.equal(paymentCalls,1);assert.equal(cartWrites,1);
    // A provider failure must not fall through to random shopping recommendations.
    global.fetch=async()=>({ok:false,status:429});
    assert.doesNotMatch((await say('yes please')).reply,/Cherry pot|Clock|Stickers/);
  }finally{global.fetch=oldFetch;for(const k of keys){if(oldEnv[k]===undefined)delete process.env[k];else process.env[k]=oldEnv[k];}}
});
