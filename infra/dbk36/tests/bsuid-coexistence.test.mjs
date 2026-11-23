import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,webcrypto} from 'node:crypto';
import worker from '../production-worker/dbk36-prod-worker.mjs';

if (!globalThis.crypto) globalThis.crypto=webcrypto;
const host='https://dbk36-whatsapp-production.victor-dmaina.workers.dev';
const bsuid='KE.1234567890123456';
const number='254707098723';
const env={
  DBK36_PRODUCTION_WORKER:'YES',DBK36_STAGING_WORKER:'NO',
  DBK36_PRODUCTION_BACKEND_ORIGIN:'https://www.decorbykasiwa.co.ke',
  DBK36_PRODUCTION_YCLOUD_ENABLED:'YES',DBK36_PRODUCTION_META_ENABLED:'NO',
  DBK36_PRODUCTION_MPESA_CALLBACK_ENABLED:'NO',DBK36_YCLOUD_PUBLIC_BOT:'NO',
  DBK36_YCLOUD_SENDER_NUMBER:'+254117553747',
  DBK36_YCLOUD_EXPECTED_WABA_ID:'1659955715520682',
  DBK36_YCLOUD_META_PHONE_NUMBER_ID:'1485264144663755',
  DBK36_YCLOUD_TEST_NUMBERS:number,
  DBK36_YCLOUD_TEST_BSUIDS:bsuid,
  DBK36_YCLOUD_WEBHOOK_SECRET:'z'.repeat(40),
  DBK36_WA_PRODUCTION_BRIDGE_SECRET:'b'.repeat(64),
  DBK36_YCLOUD_API_KEY:'k'.repeat(32)
};
const id='wamid.HBgTS0UuMTUzNTgyNTc2MTY5NzE5MBUUABIYFDNCMzFDQTVFNkIzNjU3MUUwOTE3AA==';
function inbound(from,fromUserId){
  return {type:'whatsapp.inbound_message.received',whatsappInboundMessage:{
    ...(from?{from}:{}),...(fromUserId?{fromUserId}:{}),
    to:'+254117553747',wabaId:env.DBK36_YCLOUD_EXPECTED_WABA_ID,
    type:'text',wamid:id,text:{body:'SEARCH decorative mirrors'}
  }};
}
const json=(x)=>JSON.stringify(x);
async function postWebhook(data){
  const body=json(data),t=String(Math.floor(Date.now()/1000));
  const s=createHmac('sha256',env.DBK36_YCLOUD_WEBHOOK_SECRET).update(`${t}.${body}`).digest('hex');
  return worker.fetch(new Request(host+'/api/whatsapp/ycloud-webhook',{
    method:'POST',headers:{'ycloud-signature':`t=${t},s=${s}`},body}),env);
}
async function postSend(to){
  const body=json({to,text:'TEST: mirrors available'}),ts=String(Math.floor(Date.now()/1000));
  const sig=createHmac('sha256',env.DBK36_WA_PRODUCTION_BRIDGE_SECRET).update(`${ts}.${body}`).digest('hex');
  return worker.fetch(new Request(host+'/__dbk36/send',{
    method:'POST',headers:{'x-dbk36-timestamp':ts,'x-dbk36-signature':sig},body}),env);
}
async function withMock(fn){
  const saved=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async (uri,opts)=>{
    calls.push({uri:String(uri),payload:JSON.parse(opts.body)});
    return new Response(JSON.stringify(String(uri).includes('ycloud.com')?{id:'sent-id'}:{accepted:1}),
      {status:200,headers:{'Content-Type':'application/json'}});
  };
  try{await fn(calls);}finally{globalThis.fetch=saved;}
}

test('authorized BSUID inbound is bridged to backend without converting it to phone digits',async()=>{
  await withMock(async calls=>{
    const r=await postWebhook(inbound('',bsuid));
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{accepted:1});
    assert.equal(calls.length,1);
    assert.equal(calls[0].payload.entry[0].changes[0].value.messages[0].from,bsuid);
  });
});
test('unapproved BSUID inbound stays rejected with public bot disabled',async()=>{
  await withMock(async calls=>{
    const r=await postWebhook(inbound('','KE.9999999999999999'));
    assert.equal(r.status,200);assert.deepEqual(await r.json(),{received:true,queued:false});
    assert.equal(calls.length,0);
  });
});
test('phone number inbound path is unchanged',async()=>{
  await withMock(async calls=>{
    const r=await postWebhook(inbound('+'+number,''));
    assert.equal(r.status,200);assert.equal(calls[0].payload.entry[0].changes[0].value.messages[0].from,number);
  });
});
test('unverified phone plus approved BSUID does not bypass phone path',async()=>{
  await withMock(async calls=>{
    const r=await postWebhook(inbound('+254711111111',bsuid));
    assert.deepEqual(await r.json(),{received:true,queued:false});
    assert.equal(calls.length,0);
  });
});
test('BSUID outbound uses recipient rather than to and is allowlisted',async()=>{
  await withMock(async calls=>{
    const r=await postSend(bsuid);
    assert.equal(r.status,200);assert.equal((await r.json()).sent,true);
    assert.equal(calls.length,1);
    assert.equal(calls[0].payload.recipient,bsuid);
    assert.equal('to' in calls[0].payload,false);
  });
});
test('unapproved BSUID outbound is denied before hitting YCloud',async()=>{
  await withMock(async calls=>{
    const r=await postSend('KE.9999999999999999');
    assert.equal(r.status,403);assert.equal(calls.length,0);
  });
});
test('phone outbound continues to use the E.164 to field',async()=>{
  await withMock(async calls=>{
    const r=await postSend(number);assert.equal(r.status,200);
    assert.equal(calls[0].payload.to,'+'+number);
    assert.equal('recipient' in calls[0].payload,false);
  });
});
test('unsigned inbound message is denied',async()=>{
  const r=await worker.fetch(new Request(host+'/api/whatsapp/ycloud-webhook',{
    method:'POST',body:json(inbound('',bsuid))}),env);
  assert.equal(r.status,401);
});
