const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const config={baseUrl:'https://api.safaricom.co.ke',consumerKey:'test-key',consumerSecret:'test-secret'};
function harness(fetch,extra={}){
 const modules=new Map();
 function load(file){if(modules.has(file))return modules.get(file).exports;const m={exports:{}};modules.set(file,m);
 const req=id=>id==='server-only'?{}:id==='node:crypto'?require(id):id in extra?extra[id]:id.startsWith('@/')?load(id.slice(2)+'.ts'):require(id);
 const out=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 new Function('require','module','exports','fetch',out.outputText)(req,m,m.exports,fetch);return m.exports;}
 // Ensure alias paths are loaded using one canonical key.
 return {transport:()=>load('lib/mpesa/dbk173-transport.ts'),load};
}
test('concurrent and sequential token requests reuse a valid token; credentials and sandbox stay isolated',async()=>{
 let n=0;const h=harness(async()=>{n++;return Response.json({access_token:'token-'+n,expires_in:'3599'});}).transport();
 const a=await Promise.all([h.getDarajaToken(config),h.getDarajaToken(config),h.getDarajaToken(config)]);assert.deepEqual(a,['token-1','token-1','token-1']);
 assert.equal(await h.getDarajaToken(config),'token-1');assert.equal(n,1);
 assert.equal(await h.getDarajaToken({...config,consumerSecret:'other'}),'token-2');
 assert.equal(await h.getDarajaToken({...config,baseUrl:'https://sandbox.safaricom.co.ke'}),'token-3');
});
test('429 cooldown applies before another OAuth or STK request and does not replay POST',async()=>{
 let n=0;const h=harness(async()=>{n++;return n===1?Response.json({access_token:'token',expires_in:3600}):new Response('',{status:429,headers:{'Retry-After':'120'}});}).transport();
 await h.getDarajaToken(config);const r=await h.darajaFetch(config,'/mpesa/stkpushquery/v1/query',{method:'POST'});assert.equal(r.status,429);
 await assert.rejects(h.getDarajaToken(config),/COOLDOWN/);await assert.rejects(h.darajaFetch(config,'/mpesa/stkpush/v1/processrequest',{method:'POST'}),/COOLDOWN/);assert.equal(n,2);
});
test('a network failure never retries STK and opens short cooldown',async()=>{
 let n=0;const h=harness(async()=>{n++;throw Error('timeout');}).transport();
 await assert.rejects(h.darajaFetch(config,'/mpesa/stkpush/v1/processrequest',{method:'POST'}),/timeout/);await assert.rejects(h.getDarajaToken(config),/COOLDOWN/);assert.equal(n,1);
});
test('provider token without expiry is not reused; 401 invalidates a cached token',async()=>{
 let n=0;const h=harness(async(url)=>{n++;return url.includes('/oauth/')?Response.json(n===1?{access_token:'one'}:{access_token:'token-'+n,expires_in:3600}):new Response('',{status:401});}).transport();
 assert.equal(await h.getDarajaToken(config),'one');assert.equal(await h.getDarajaToken(config),'token-2');await h.darajaFetch(config,'/mpesa/stkpushquery/v1/query',{method:'POST'});assert.equal(await h.getDarajaToken(config),'token-4');
});
test('POS authentication failure occurs before create/claim or STK; existing order not modified',async()=>{
 const queries=[];let dispatches=0;
 const h=harness(async()=>{throw Error('unexpected network');},{
  '@/lib/db/dbk62-pos-cutover':{dbk62CutoverRequested:()=>true,dbk62GetProductionSql:()=>async(parts)=>{queries.push(parts.join('?'));return [];}},
  '@/lib/pos/server':{prepareDBK68MpesaSale:async()=>({customerPhone:'254700000000',totalMinor:100})},
  '@/lib/mpesa/daraja':{darajaAccountReference:()=> 'DBK123',prepareDarajaStkPush:async()=>{throw Error('DARAJA_AUTH_NOT_READY_NO_STK');},initiateDarajaStkPush:async()=>{dispatches++;}},
 });
 const prev=[process.env.DBK68_MPESA_BACKEND,process.env.DBK68_CUTOVER_APPROVED];Object.assign(process.env,{DBK68_MPESA_BACKEND:'neon',DBK68_CUTOVER_APPROVED:'YES'});
 try{await assert.rejects(h.load('lib/db/dbk68-daraja-neon.ts').dbk68CreateSale({requestId:'12345678'},{id:'staff'}),/DARAJA_AUTH_NOT_READY_NO_STK/);assert.equal(queries.length,1);assert.match(queries[0],/SELECT \*/);assert.equal(dispatches,0);}
 finally{for(const [i,k] of ['DBK68_MPESA_BACKEND','DBK68_CUTOVER_APPROVED'].entries()){if(prev[i]===undefined)delete process.env[k];else process.env[k]=prev[i];}}
});
test('prepared POS dispatch authenticates first and the same closure can only send one STK',async()=>{
 const env={MPESA_ENV:'production',MPESA_SHORTCODE:'123456',MPESA_PASSKEY:'test-pass',MPESA_CONSUMER_KEY:'test-key',MPESA_CONSUMER_SECRET:'test-secret',MPESA_CALLBACK_URL:'https://example.com/callback',MPESA_TRANSACTION_TYPE:'CustomerBuyGoodsOnline'};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);let oauth=0,stk=0;
 try{const m=harness(async(url)=>{if(url.includes('/oauth/')){oauth++;return Response.json({access_token:'token',expires_in:3600});}stk++;return Response.json({ResponseCode:'0',CheckoutRequestID:'checkout-123',MerchantRequestID:'merchant-123'});}).load('lib/mpesa/daraja.ts');
 const dispatch=await m.prepareDarajaStkPush({phone:'254700000000',amount:1,accountReference:'DBK123'});assert.equal(oauth,1);assert.equal(stk,0);assert.equal((await dispatch()).checkoutRequestId,'checkout-123');await assert.rejects(dispatch(),/ALREADY_ATTEMPTED/);assert.equal(stk,1);}
 finally{for(const k of Object.keys(old)){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
