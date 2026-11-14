import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../infra/dbk36/production-worker/dbk36-prod-worker.mjs';
const base='https://dbk36-whatsapp-production.victor-dmaina.workers.dev';
const secret='whsec_abcdefghijklmnopqrstuvwxyzabcdef';
const bridge='bridge_secret_abcdefghijklmnopqrstuvwxyz';
const env={
 DBK36_PRODUCTION_WORKER:'YES',DBK36_STAGING_WORKER:'NO',
 DBK36_PRODUCTION_BACKEND_ORIGIN:'https://www.decorbykasiwa.co.ke',
 DBK36_PRODUCTION_META_ENABLED:'NO',DBK36_PRODUCTION_YCLOUD_ENABLED:'YES',
 DBK36_YCLOUD_PUBLIC_BOT:'NO',DBK36_YCLOUD_TEST_NUMBERS:'254712345678',
 DBK36_YCLOUD_EXPECTED_WABA_ID:'1659955715520682',
 DBK36_YCLOUD_META_PHONE_NUMBER_ID:'1485264144663755',
 DBK36_YCLOUD_WEBHOOK_SECRET:secret,
 DBK36_WA_PRODUCTION_BRIDGE_SECRET:bridge,
 DBK36_YCLOUD_API_KEY:'yckey_test_abcdefghijklmnopqrstuvwxyz',
 DBK36_YCLOUD_SENDER_NUMBER:'+254117553747'
};
const evt=(from='+254712345678')=>({
 id:'evt_abc', type:'whatsapp.inbound_message.received',apiVersion:'v2',
 whatsappInboundMessage:{id:'msg1',wamid:'wamid.HBgN1234567890',
 wabaId:'1659955715520682',from,to:'+254117553747',type:'text',text:{body:'Hi'}}
});
function signed(raw, key=secret){const t=String(Math.floor(Date.now()/1000));return `t=${t},s=${createHmac('sha256',key).update(t+'.'+raw).digest('hex')}`;}
function req(body, header=signed(body)){
 return new Request(base+'/api/whatsapp/ycloud-webhook',{
   method:'POST',headers:{'Content-Type':'application/json','YCloud-Signature':header},body});
}
test('unsigned webhook is rejected, no backend call',async()=>{
 let count=0;const fetch0=globalThis.fetch;
 globalThis.fetch=async()=>{count++;throw Error('network should not be called')};
 try{const body=JSON.stringify(evt());const r=await worker.fetch(req(body,'t=1760000000,s='+ 'a'.repeat(64)),env);
 assert.equal(r.status,401);assert.equal(count,0);}finally{globalThis.fetch=fetch0;}
});
test('valid YCloud inbound becomes validated, HMAC signed Meta-shaped internal relay',async()=>{
 const fetch0=globalThis.fetch;let call;
 globalThis.fetch=async (url, init)=>{call={url,init};return Response.json({accepted:1})};
 try{
   const body=JSON.stringify(evt());const r=await worker.fetch(req(body),env);
   assert.equal(r.status,200);
   assert.equal(call.url,'https://www.decorbykasiwa.co.ke/api/whatsapp/production-webhook');
   assert.equal(call.init.redirect,'manual');
   const forwarded=JSON.parse(call.init.body);
   assert.equal(forwarded.entry[0].changes[0].value.metadata.phone_number_id,'1485264144663755');
   assert.equal(forwarded.entry[0].changes[0].value.messages[0].from,'254712345678');
   const ts=call.init.headers['x-dbk36-timestamp'];
   const expected=createHmac('sha256',bridge).update(ts+'.'+call.init.body).digest('hex');
   assert.equal(call.init.headers['x-dbk36-signature'],expected);
 }finally{globalThis.fetch=fetch0;}
});
test('non-allowlisted sender is acknowledged with no bot processing',async()=>{
 const fetch0=globalThis.fetch;let count=0;globalThis.fetch=async()=>{count++;throw Error('never relay')};
 try{const body=JSON.stringify(evt('+254799999999'));
 const r=await worker.fetch(req(body),env);assert.equal(r.status,200);assert.equal(count,0);
 assert.equal((await r.json()).queued,false);
 }finally{globalThis.fetch=fetch0;}
});
test('YCloud status event is safely acknowledged and never relayed',async()=>{
 const fetch0=globalThis.fetch;let count=0;globalThis.fetch=async()=>{count++;throw Error('never relay')};
 try{const body=JSON.stringify({id:'evt_status',type:'whatsapp.message.updated',whatsappMessage:{status:'delivered'}});
 const r=await worker.fetch(req(body),env);assert.equal(r.status,200);assert.equal(count,0);
 }finally{globalThis.fetch=fetch0;}
});
test('outbound signed worker request uses YCloud, not Meta',async()=>{
 const fetch0=globalThis.fetch;let call;globalThis.fetch=async(url,init)=>{call={url,init};return Response.json({id:'y_outbound_123',status:'accepted'})};
 try{
   const body=JSON.stringify({to:'254712345678',text:'Hello'}),ts=String(Math.floor(Date.now()/1000));
   const sig=createHmac('sha256',bridge).update(ts+'.'+body).digest('hex');
   const req=new Request(base+'/__dbk36/send',{method:'POST',body,headers:{'x-dbk36-timestamp':ts,'x-dbk36-signature':sig}});
   const r=await worker.fetch(req,env);assert.equal(r.status,200);
   assert.equal(call.url,'https://api.ycloud.com/v2/whatsapp/messages');
   assert.equal(call.init.headers['X-API-Key'],env.DBK36_YCLOUD_API_KEY);
   const sent=JSON.parse(call.init.body);assert.equal(sent.from,'+254117553747');assert.equal(sent.to,'+254712345678');
 }finally{globalThis.fetch=fetch0;}
});
test('bot flag defaults off even if worker is deployed',async()=>{
 const r=await worker.fetch(new Request(base+'/__dbk36/health'),{...env,DBK36_PRODUCTION_YCLOUD_ENABLED:'NO'});
 const o=await r.json();assert.equal(o.whatsappEnabled,false);
});
